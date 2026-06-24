"""Generate synthetic Aquanote demo videos from race metadata."""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_METADATA_PATH = (
    REPO_ROOT
    / "videos"
    / "2025_courses_demo"
    / "2025_courses_demo_translation_carre_50_finale"
    / "2025_courses_demo_translation_carre_50_finale.json"
)
LANE_CAP_COLORS = [
    (12, 55, 210),
    (0, 125, 255),
    (0, 180, 255),
    (0, 190, 155),
    (0, 145, 70),
    (40, 120, 40),
    (80, 95, 20),
    (130, 75, 0),
    (170, 45, 15),
    (190, 20, 70),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate synthetic demo videos from Aquanote race metadata. "
            "Use the default square mode for homography checks or the race mode "
            "for a multi-lane swimming simulation."
        )
    )
    parser.add_argument(
        "--metadata",
        type=Path,
        default=DEFAULT_METADATA_PATH,
        help="Path to the race metadata JSON file.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("output_video.mp4"),
        help="Output video path.",
    )
    parser.add_argument(
        "--scenario",
        choices=("square", "race"),
        default="square",
        help="Synthetic scene to render.",
    )
    parser.add_argument(
        "--square-size",
        type=int,
        default=10,
        help="Square size in destination-space pixels for the square scenario.",
    )
    parser.add_argument(
        "--frame-count",
        type=int,
        default=400,
        help="Number of frames for one forward-and-back square motion cycle.",
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=50,
        help="Frames per second for the generated video.",
    )
    parser.add_argument(
        "--video-index",
        type=int,
        default=0,
        help="Index of the video entry to use from the metadata file.",
    )
    parser.add_argument(
        "--render-lanes",
        action="store_true",
        help="Render lane separators and lane labels on each frame.",
    )
    parser.add_argument(
        "--race-seconds",
        type=float,
        default=54.0,
        help="Total race duration in seconds for the race scenario.",
    )
    return parser.parse_args()


def load_video_metadata(metadata_path: Path, video_index: int) -> tuple[dict, dict]:
    metadata_path = metadata_path.resolve()
    if not metadata_path.is_file():
        raise FileNotFoundError(f"Metadata file not found: {metadata_path}")

    with metadata_path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    videos = data.get("videos")
    if not isinstance(videos, list) or not videos:
        raise ValueError(f"No video entries found in metadata file: {metadata_path}")

    if video_index < 0 or video_index >= len(videos):
        raise IndexError(
            f"Video index {video_index} is out of range for metadata file: {metadata_path}"
        )

    video = videos[video_index]
    required_keys = ("srcPts", "destPts", "width", "height")
    missing_keys = [key for key in required_keys if key not in video]
    if missing_keys:
        raise KeyError(
            f"Metadata is missing required keys {missing_keys} for video index {video_index}"
        )

    return data, video


def get_lane_keys(metadata: dict) -> list[str]:
    def lane_sort_key(key: str) -> tuple[int, str]:
        digits = "".join(ch for ch in key if ch.isdigit())
        return (int(digits) if digits else 10_000, key)

    lane_map = metadata.get("lignes") or {}
    return sorted(lane_map.keys(), key=lane_sort_key)


def build_square_positions(
    destination_points: np.ndarray, square_size: int, frame_count: int
) -> list[tuple[int, int, float]]:
    if square_size <= 0:
        raise ValueError("--square-size must be a positive integer")
    if frame_count < 2:
        raise ValueError("--frame-count must be at least 2")

    x_min, y_min = np.min(destination_points, axis=0)
    x_max, y_max = np.max(destination_points, axis=0)
    rect_height = int(y_max - y_min)

    positions: list[tuple[int, int, float]] = []
    for frame_index in range(frame_count):
        t = frame_index / (frame_count - 1)
        progress = t * 2 if t <= 0.5 else 2 - t * 2
        x = int(x_min + progress * (x_max - x_min - square_size))
        y = int(y_min + rect_height // 2 - square_size // 2)
        positions.append((x, y, progress))

    return positions


def create_video_writer(
    output_path: Path, fps: int, frame_width: int, frame_height: int
) -> tuple[cv2.VideoWriter, Path]:
    output_suffix = output_path.suffix.lower()
    if output_suffix == ".avi":
        candidates = [(output_path, "MJPG")]
    else:
        candidates = [
            (output_path, "avc1"),
            (output_path, "H264"),
            (output_path.with_suffix(".avi"), "MJPG"),
        ]

    for candidate_path, codec in candidates:
        fourcc = cv2.VideoWriter_fourcc(*codec)
        writer = cv2.VideoWriter(str(candidate_path), fourcc, fps, (frame_width, frame_height))
        if writer.isOpened():
            return writer, candidate_path
        writer.release()

    raise RuntimeError(
        "Could not open an output video writer. Tried: "
        + ", ".join(f"{path} ({codec})" for path, codec in candidates)
    )


def finalize_output(actual_output_path: Path, requested_output_path: Path) -> Path:
    if actual_output_path.suffix.lower() == requested_output_path.suffix.lower():
        return actual_output_path.resolve()

    if requested_output_path.suffix.lower() != ".mp4":
        return actual_output_path.resolve()

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        print(
            "MP4 encoding was unavailable through OpenCV and ffmpeg was not found. "
            f"Keeping fallback output: {actual_output_path}"
        )
        return actual_output_path.resolve()

    command = [
        ffmpeg,
        "-y",
        "-i",
        str(actual_output_path),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(requested_output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        print("ffmpeg transcoding failed; keeping AVI fallback.")
        print(result.stderr.strip())
        return actual_output_path.resolve()

    actual_output_path.unlink(missing_ok=True)
    return requested_output_path.resolve()


def transform_points(points: np.ndarray, homography: np.ndarray) -> np.ndarray:
    return cv2.perspectiveTransform(points[None, :, :], homography)[0]


def draw_pool_surface(
    frame: np.ndarray, destination_points: np.ndarray, homography: np.ndarray
) -> None:
    pool_polygon = transform_points(destination_points, homography).astype(np.int32)
    cv2.fillPoly(frame, [pool_polygon], color=(200, 230, 245))
    cv2.polylines(frame, [pool_polygon], isClosed=True, color=(160, 195, 215), thickness=5)


def draw_lane_overlay(
    frame: np.ndarray,
    metadata: dict,
    destination_points: np.ndarray,
    homography: np.ndarray,
) -> None:
    lane_keys = get_lane_keys(metadata)
    lane_count = len(lane_keys)
    if lane_count == 0:
        return

    x_min, y_min = np.min(destination_points, axis=0)
    x_max, y_max = np.max(destination_points, axis=0)
    lane_height = (y_max - y_min) / lane_count
    label_color = (70, 70, 70)

    for lane_index in range(lane_count + 1):
        y = y_min + lane_index * lane_height
        lane_line = np.array([[x_min, y], [x_max, y]], dtype=np.float32)
        lane_line_src = transform_points(lane_line, homography).astype(np.int32)
        rope_color = (20, 130, 240) if lane_index in {0, lane_count} else (0, 200, 255)
        cv2.line(
            frame,
            tuple(lane_line_src[0]),
            tuple(lane_line_src[1]),
            rope_color,
            3,
            lineType=cv2.LINE_AA,
        )

    for lane_index, lane_key in enumerate(lane_keys):
        lane_name = str(metadata["lignes"][lane_key])
        label_point = np.array(
            [[x_min + 16, y_min + (lane_index + 0.5) * lane_height]],
            dtype=np.float32,
        )
        label_point_src = transform_points(label_point, homography)[0].astype(np.int32)
        cv2.putText(
            frame,
            lane_name,
            tuple(label_point_src),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            label_color,
            2,
            lineType=cv2.LINE_AA,
        )


def pool_x_to_destination_x(
    pool_x: float, x_min: float, x_max: float, pool_length: float
) -> float:
    return x_min + (1.0 - (pool_x / pool_length)) * (x_max - x_min)


def get_race_position(
    frame_index: int,
    total_frames: int,
    pool_length: float,
    race_distance: float,
    start_side: str,
) -> tuple[float, int]:
    race_progress = frame_index / (total_frames - 1)
    race_distance_done = min(race_distance * race_progress, race_distance)
    lane_count = max(1, math.ceil(race_distance / pool_length))

    if race_distance_done >= race_distance:
        length_index = lane_count - 1
        within_length = pool_length
    else:
        length_index = int(race_distance_done // pool_length)
        within_length = race_distance_done - length_index * pool_length

    moving_back = length_index % 2 == 1
    if start_side == "left":
        pool_x = within_length if moving_back else pool_length - within_length
        direction = -1 if moving_back else 1
    else:
        pool_x = pool_length - within_length if moving_back else within_length
        direction = 1 if moving_back else -1

    return pool_x, direction


def build_swimmer_polygon(
    center_x: float,
    center_y: float,
    direction: int,
    stroke_phase: float,
    body_length: float = 26.0,
    body_width: float = 6.0,
) -> np.ndarray:
    shoulder_shift = math.sin(stroke_phase) * body_width * 0.25
    return np.array(
        [
            [center_x + direction * body_length * 0.48, center_y],
            [center_x + direction * body_length * 0.14, center_y - body_width * 0.62],
            [center_x - direction * body_length * 0.18, center_y - body_width * 0.50],
            [center_x - direction * body_length * 0.52, center_y - shoulder_shift],
            [center_x - direction * body_length * 0.22, center_y + body_width * 0.56],
            [center_x + direction * body_length * 0.16, center_y + body_width * 0.58],
        ],
        dtype=np.float32,
    )


def build_circle_polygon(
    center_x: float, center_y: float, radius: float, point_count: int = 18
) -> np.ndarray:
    angles = np.linspace(0, 2 * math.pi, point_count, endpoint=False)
    return np.array(
        [
            [center_x + math.cos(angle) * radius, center_y + math.sin(angle) * radius]
            for angle in angles
        ],
        dtype=np.float32,
    )


def draw_swimmer(
    frame: np.ndarray,
    homography: np.ndarray,
    center_x: float,
    center_y: float,
    direction: int,
    lane_index: int,
    frame_index: int,
    fps: int,
) -> None:
    stroke_phase = (frame_index / fps) * 2 * math.pi * 0.9 + lane_index * 0.35
    center_y += math.sin(stroke_phase) * 0.18
    cap_color = LANE_CAP_COLORS[lane_index % len(LANE_CAP_COLORS)]

    swimmer_shape = build_swimmer_polygon(center_x, center_y, direction, stroke_phase)
    swimmer_shape_src = transform_points(swimmer_shape, homography).astype(np.int32)

    wake_points = np.array(
        [
            [center_x - direction * 18.0, center_y - 0.35],
            [center_x - direction * 30.0, center_y + math.sin(stroke_phase) * 0.45],
            [center_x - direction * 44.0, center_y - 0.15],
        ],
        dtype=np.float32,
    )
    wake_src = transform_points(wake_points, homography).astype(np.int32)
    cv2.polylines(frame, [wake_src], isClosed=False, color=(250, 250, 250), thickness=2)

    cv2.fillPoly(frame, [swimmer_shape_src], color=cap_color)
    cv2.polylines(frame, [swimmer_shape_src], isClosed=True, color=(35, 35, 35), thickness=1)

    head = build_circle_polygon(
        center_x + direction * 8.0,
        center_y - 0.2,
        radius=2.6,
    )
    head_src = transform_points(head, homography).astype(np.int32)
    cv2.fillPoly(frame, [head_src], color=(235, 225, 210))

    splash = build_circle_polygon(
        center_x + direction * 13.0,
        center_y - 0.7,
        radius=1.1 + 0.2 * math.sin(stroke_phase),
        point_count=12,
    )
    splash_src = transform_points(splash, homography).astype(np.int32)
    cv2.fillPoly(frame, [splash_src], color=(255, 255, 255))


def render_square_video(
    writer: cv2.VideoWriter,
    metadata: dict,
    destination_points: np.ndarray,
    homography: np.ndarray,
    frame_height: int,
    frame_width: int,
    square_size: int,
    frame_count: int,
    render_lanes: bool,
) -> None:
    positions = build_square_positions(destination_points, square_size, frame_count)

    for x, y, progress in positions:
        frame = np.full((frame_height, frame_width, 3), 255, dtype=np.uint8)
        draw_pool_surface(frame, destination_points, homography)
        if render_lanes:
            draw_lane_overlay(frame, metadata, destination_points, homography)

        square_points = np.array(
            [
                [x, y],
                [x + square_size, y],
                [x + square_size, y + square_size],
                [x, y + square_size],
            ],
            dtype=np.float32,
        )
        source_square_points = transform_points(square_points, homography)

        percent = int(progress * 100)
        color = (0, 0, 255) if percent % 20 == 0 else (0, 255, 0)
        polygon = source_square_points.astype(np.int32)
        cv2.polylines(frame, [polygon], isClosed=True, color=color, thickness=3)
        cv2.fillPoly(frame, [polygon], color=color)
        writer.write(frame)


def render_race_video(
    writer: cv2.VideoWriter,
    metadata: dict,
    destination_points: np.ndarray,
    homography: np.ndarray,
    frame_height: int,
    frame_width: int,
    fps: int,
    race_seconds: float,
    render_lanes: bool,
) -> None:
    lane_keys = get_lane_keys(metadata)
    lane_count = len(lane_keys)
    if lane_count == 0:
        raise ValueError("The race scenario requires lane metadata in 'lignes'.")

    pool_length = float((metadata.get("taille_piscine") or [50])[0])
    race_distance = float(metadata.get("distance", pool_length))
    start_side = str(metadata.get("start_side", "left")).lower()
    total_frames = max(2, int(round(race_seconds * fps)))

    x_min, y_min = np.min(destination_points, axis=0)
    x_max, y_max = np.max(destination_points, axis=0)
    lane_height = (y_max - y_min) / lane_count

    base_frame = np.full((frame_height, frame_width, 3), 242, dtype=np.uint8)
    draw_pool_surface(base_frame, destination_points, homography)
    if render_lanes:
        draw_lane_overlay(base_frame, metadata, destination_points, homography)

    title = f"{int(race_distance)} m synthetic demo - {lane_count} lanes"
    cv2.putText(
        base_frame,
        title,
        (50, 65),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (55, 55, 55),
        2,
        lineType=cv2.LINE_AA,
    )

    for frame_index in range(total_frames):
        frame = base_frame.copy()
        pool_x, direction = get_race_position(
            frame_index=frame_index,
            total_frames=total_frames,
            pool_length=pool_length,
            race_distance=race_distance,
            start_side=start_side,
        )
        destination_x = pool_x_to_destination_x(pool_x, x_min, x_max, pool_length)

        for lane_index in range(lane_count):
            lane_center_y = y_min + (lane_index + 0.5) * lane_height
            draw_swimmer(
                frame=frame,
                homography=homography,
                center_x=destination_x,
                center_y=lane_center_y,
                direction=direction,
                lane_index=lane_index,
                frame_index=frame_index,
                fps=fps,
            )

        elapsed_seconds = frame_index / fps
        cv2.putText(
            frame,
            f"{elapsed_seconds:05.2f}s",
            (50, frame_height - 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (55, 55, 55),
            2,
            lineType=cv2.LINE_AA,
        )
        writer.write(frame)


def generate_video(
    metadata_path: Path,
    output_path: Path,
    scenario: str,
    square_size: int,
    frame_count: int,
    fps: int,
    video_index: int,
    render_lanes: bool,
    race_seconds: float,
) -> Path:
    metadata, video = load_video_metadata(metadata_path, video_index)
    source_points = np.array(video["srcPts"], dtype=np.float32)
    destination_points = np.array(video["destPts"], dtype=np.float32)
    homography = cv2.getPerspectiveTransform(destination_points, source_points)
    frame_width = int(video["width"])
    frame_height = int(video["height"])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer, actual_output_path = create_video_writer(
        output_path=output_path,
        fps=fps,
        frame_width=frame_width,
        frame_height=frame_height,
    )

    if scenario == "square":
        render_square_video(
            writer=writer,
            metadata=metadata,
            destination_points=destination_points,
            homography=homography,
            frame_height=frame_height,
            frame_width=frame_width,
            square_size=square_size,
            frame_count=frame_count,
            render_lanes=render_lanes,
        )
    else:
        render_race_video(
            writer=writer,
            metadata=metadata,
            destination_points=destination_points,
            homography=homography,
            frame_height=frame_height,
            frame_width=frame_width,
            fps=fps,
            race_seconds=race_seconds,
            render_lanes=render_lanes,
        )

    writer.release()
    return finalize_output(actual_output_path, output_path)


def main() -> int:
    args = parse_args()
    output_path = generate_video(
        metadata_path=args.metadata,
        output_path=args.output,
        scenario=args.scenario,
        square_size=args.square_size,
        frame_count=args.frame_count,
        fps=args.fps,
        video_index=args.video_index,
        render_lanes=args.render_lanes,
        race_seconds=args.race_seconds,
    )
    print(f"Video generated: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
