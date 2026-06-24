"""Generate Aquanote assets from sportsdata basic swimming tracking CSV."""

from __future__ import annotations

import argparse
import csv
import json
import math
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from generate_video import (
    draw_lane_overlay,
    draw_pool_surface,
    draw_swimmer,
    finalize_output as finalize_aquanote_video_output,
    pool_x_to_destination_x,
)


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_YEAR = "2026"
DEFAULT_COMPETITION = "sportsdata"
DEFAULT_COURSE_TYPE = "translation"
DEFAULT_SWIMMER_SEX = "carre"
DEFAULT_DISTANCE = "100"
DEFAULT_COURSE = "demifinale"
DEFAULT_BASIC_CSV = """frameId,swimmerId,eventId,time,distance
0,1,dive,0.00,0.00
30,1,cycle,1.00,1.80
60,1,cycle,2.00,3.70
90,1,finish,3.00,5.60
"""
AQUANOTE_COLUMNS = [
    "frameId",
    "swimmerId",
    "swimmerName",
    "lane",
    "cumul",
    "eventId",
    "eventX",
    "eventY",
    "event",
    "TempsVideo (s)",
    "Temps (s)",
    "distance (m)",
    "tempo (s)",
    "frequence (cylce/min)",
    "amplitude (m)",
    "vitesse (m/s)",
]


@dataclass(frozen=True)
class BasicTrackingRow:
    frame_id: int
    swimmer_id: int
    event_id: str
    time: float
    distance: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Convert sportsdata basic swimming tracking CSV files "
            "into Aquanote video, annotation CSV, and metadata JSON."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        help=(
            "sportsdata basic tracking CSV. If omitted, the script writes and uses "
            "the bundled sportsdata sample in the output directory."
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help=(
            "Output run directory. Defaults to "
            "videos/{year}_{competition}/"
            "{year}_{competition}_{type_nage}_{sexe_nageurs}_{distance}_{course}."
        ),
    )
    parser.add_argument("--year", default=DEFAULT_YEAR)
    parser.add_argument("--competition", default=DEFAULT_COMPETITION)
    parser.add_argument(
        "--type-nage",
        "--course-type",
        dest="course_type",
        default=DEFAULT_COURSE_TYPE,
        help="Run selector part 1, e.g. translation.",
    )
    parser.add_argument(
        "--sexe-nageurs",
        "--swimmer-sex",
        dest="swimmer_sex",
        default=DEFAULT_SWIMMER_SEX,
        help="Run selector part 2, e.g. carre.",
    )
    parser.add_argument(
        "--distance",
        default=DEFAULT_DISTANCE,
        help="Run selector part 3, e.g. 100.",
    )
    parser.add_argument("--course", default=DEFAULT_COURSE)
    parser.add_argument(
        "--competition-name",
        help="Competition folder name. Defaults to {year}_{competition}.",
    )
    parser.add_argument(
        "--run-name",
        help=(
            "Run folder and file stem. Defaults to "
            "{competition_name}_{type_nage}_{sexe_nageurs}_{distance}_{course}."
        ),
    )
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--pool-length", type=float, default=50.0)
    parser.add_argument("--pool-width", type=float, default=20.0)
    parser.add_argument("--lane", default="ligne1")
    parser.add_argument("--swimmer-name", default="Swimmer 1")
    parser.add_argument("--start-side", choices=("left", "right"), default="left")
    parser.add_argument("--post-roll-seconds", type=float, default=1.0)
    parser.add_argument(
        "--flat-json",
        type=Path,
        default=REPO_ROOT / "videos" / "flat.json",
        help="Flatdir manifest to regenerate after writing assets.",
    )
    parser.add_argument(
        "--skip-flatdir",
        action="store_true",
        help="Do not regenerate videos/flat.json after writing assets.",
    )
    parser.add_argument(
        "--no-render-lanes",
        action="store_false",
        dest="render_lanes",
        help="Disable lane separators and labels in the generated video.",
    )
    parser.set_defaults(render_lanes=True)
    return parser.parse_args()


def slug(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in str(value).strip().lower())
    return "_".join(part for part in cleaned.split("_") if part)


def derived_competition_name(args: argparse.Namespace) -> str:
    if args.competition_name:
        return slug(args.competition_name)
    return f"{slug(args.year)}_{slug(args.competition)}"


def derived_run_name(args: argparse.Namespace) -> str:
    if args.run_name:
        return slug(args.run_name)
    competition_name = derived_competition_name(args)
    return "_".join(
        slug(part)
        for part in (
            competition_name,
            args.course_type,
            args.swimmer_sex,
            args.distance,
            args.course,
        )
        if slug(part)
    )


def resolve_output_dir(args: argparse.Namespace, competition_name: str, run_name: str) -> Path:
    if args.output_dir:
        return args.output_dir.resolve()
    return (REPO_ROOT / "videos" / competition_name / run_name).resolve()


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def regenerate_flat_json(flat_json_path: Path) -> bool:
    command = [
        sys.executable,
        "-m",
        "flatdir",
        "videos",
        "--limit",
        "10",
        "--nested",
        "--only",
        "type=directory",
        "--add",
        "espadon=false",
        "--add",
        "espadonModifie=false",
        "--add",
        "data_checked=false",
        "--no-defaults",
        "--min-depth",
        "1",
        "--add-depth",
        "2",
        "--ignore-typical",
    ]

    try:
        result = subprocess.run(
            command,
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        print(
            "warning: could not regenerate flat.json with flatdir. "
            "Install flatdir or run the README command manually.",
            file=sys.stderr,
        )
        if isinstance(exc, subprocess.CalledProcessError) and exc.stderr:
            print(exc.stderr.strip(), file=sys.stderr)
        return False

    flat_json_path.parent.mkdir(parents=True, exist_ok=True)
    flat_json_path.write_text(result.stdout, encoding="utf-8")
    return True


def ensure_default_input(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    input_path = output_dir / "sportsdata_basic_tracking.csv"
    if not input_path.exists():
        input_path.write_text(DEFAULT_BASIC_CSV, encoding="utf-8")
    return input_path


def read_basic_tracking_csv(input_path: Path) -> list[BasicTrackingRow]:
    with input_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required_columns = {"frameId", "swimmerId", "eventId", "time", "distance"}
        missing_columns = required_columns.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(
                f"{input_path} is missing sportsdata basic columns: "
                f"{', '.join(sorted(missing_columns))}"
            )

        rows = [
            BasicTrackingRow(
                frame_id=int(row["frameId"]),
                swimmer_id=int(row["swimmerId"]),
                event_id=str(row["eventId"]).strip(),
                time=float(row["time"]),
                distance=float(row["distance"]),
            )
            for row in reader
        ]

    if not rows:
        raise ValueError(f"No tracking rows found in {input_path}")

    rows.sort(key=lambda row: (row.swimmer_id, row.frame_id, row.time))
    return rows


def format_number(value: float | None) -> str:
    if value is None or not math.isfinite(value):
        return ""
    return f"{value:.2f}"


def build_aquanote_rows(
    rows: list[BasicTrackingRow],
    lane: str,
    swimmer_name: str,
    pool_length: float,
    pool_width: float,
) -> list[dict[str, str | int]]:
    aquanote_rows: list[dict[str, str | int]] = []
    previous_by_swimmer: dict[int, BasicTrackingRow] = {}
    lane_digits = "".join(ch for ch in lane if ch.isdigit())
    aquanote_swimmer_id = max(0, int(lane_digits) - 1) if lane_digits else 0

    for row in rows:
        previous = previous_by_swimmer.get(row.swimmer_id)
        delta_time = row.time - previous.time if previous else None
        delta_distance = row.distance - previous.distance if previous else None
        tempo = 2 * delta_time if delta_time and delta_time > 0 else None
        amplitude = 2 * delta_distance if delta_distance and delta_distance > 0 else None
        frequency = 60 / tempo if tempo else None
        speed = amplitude / tempo if amplitude and tempo else None
        event_x = max(0.0, min(pool_length, pool_length - row.distance))
        event_y = pool_width / 2

        aquanote_rows.append(
            {
                "frameId": row.frame_id,
                "swimmerId": aquanote_swimmer_id,
                "swimmerName": swimmer_name,
                "lane": lane,
                "cumul": format_number(row.distance),
                "eventId": row.event_id,
                "eventX": format_number(event_x),
                "eventY": format_number(event_y),
                "event": row.event_id,
                "TempsVideo (s)": format_number(row.time),
                "Temps (s)": format_number(row.time),
                "distance (m)": format_number(row.distance),
                "tempo (s)": format_number(tempo),
                "frequence (cylce/min)": format_number(frequency),
                "amplitude (m)": format_number(amplitude),
                "vitesse (m/s)": format_number(speed),
            }
        )
        previous_by_swimmer[row.swimmer_id] = row

    return aquanote_rows


def write_aquanote_csv(path: Path, rows: list[dict[str, str | int]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=AQUANOTE_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def interpolate_distance(rows: list[BasicTrackingRow], time_seconds: float) -> float:
    if time_seconds <= rows[0].time:
        return rows[0].distance
    if time_seconds >= rows[-1].time:
        return rows[-1].distance

    for left, right in zip(rows, rows[1:]):
        if left.time <= time_seconds <= right.time:
            span = right.time - left.time
            if span <= 0:
                return right.distance
            ratio = (time_seconds - left.time) / span
            return left.distance + ratio * (right.distance - left.distance)

    return rows[-1].distance


def render_tracking_video(
    output_path: Path,
    metadata: dict,
    rows: list[BasicTrackingRow],
    fps: int,
    post_roll_seconds: float,
    render_lanes: bool,
) -> Path:
    video = metadata["videos"][0]
    source_points = np.array(video["srcPts"], dtype=np.float32)
    destination_points = np.array(video["destPts"], dtype=np.float32)
    homography = cv2.getPerspectiveTransform(destination_points, source_points)
    frame_width = int(video["width"])
    frame_height = int(video["height"])
    pool_length = float((metadata.get("taille_piscine") or [50])[0])
    total_seconds = rows[-1].time + max(0.0, post_roll_seconds)
    total_frames = max(rows[-1].frame_id + 1, int(math.ceil(total_seconds * fps)) + 1)
    lane_keys = sorted((metadata.get("lignes") or {}).keys())
    lane_index = lane_keys.index(metadata["sourceSportsdata"]["lane"]) if lane_keys else 0

    x_min, y_min = np.min(destination_points, axis=0)
    x_max, y_max = np.max(destination_points, axis=0)
    lane_height = (y_max - y_min) / max(1, len(lane_keys))
    lane_center_y = y_min + (lane_index + 0.5) * lane_height
    direction = 1 if metadata.get("start_side") == "left" else -1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_suffix = output_path.suffix.lower()
    if output_suffix == ".avi":
        candidates = [(output_path, "MJPG")]
    else:
        candidates = [
            (output_path, "avc1"),
            (output_path, "H264"),
            (output_path.with_suffix(".avi"), "MJPG"),
        ]

    writer = None
    actual_output_path = output_path
    for candidate_path, codec in candidates:
        fourcc = cv2.VideoWriter_fourcc(*codec)
        candidate_writer = cv2.VideoWriter(
            str(candidate_path),
            fourcc,
            fps,
            (frame_width, frame_height),
        )
        if candidate_writer.isOpened():
            writer = candidate_writer
            actual_output_path = candidate_path
            break
        candidate_writer.release()

    if writer is None:
        raise RuntimeError(
            "Could not open an output video writer. Tried: "
            + ", ".join(f"{path} ({codec})" for path, codec in candidates)
        )

    base_frame = np.full((frame_height, frame_width, 3), 242, dtype=np.uint8)
    draw_pool_surface(base_frame, destination_points, homography)
    if render_lanes:
        draw_lane_overlay(base_frame, metadata, destination_points, homography)

    for frame_index in range(total_frames):
        frame = base_frame.copy()
        time_seconds = frame_index / fps
        distance = interpolate_distance(rows, time_seconds)
        pool_x = pool_length - distance if metadata.get("start_side") == "left" else distance
        destination_x = pool_x_to_destination_x(pool_x, x_min, x_max, pool_length)

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
        cv2.putText(
            frame,
            f"{time_seconds:05.2f}s  {distance:04.1f}m",
            (42, frame_height - 36),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.78,
            (55, 55, 55),
            2,
            lineType=cv2.LINE_AA,
        )
        writer.write(frame)

    writer.release()
    return finalize_aquanote_video_output(actual_output_path, output_path)


def copy_input(input_path: Path, output_dir: Path) -> Path:
    output_path = output_dir / "sportsdata_basic_tracking.csv"
    if input_path.resolve() != output_path.resolve():
        shutil.copyfile(input_path, output_path)
    return output_path


def build_metadata(
    run_name: str,
    video_name: str,
    csv_name: str,
    source_csv_name: str,
    year: str,
    competition: str,
    course_type: str,
    swimmer_sex: str,
    course_distance: str,
    course: str,
    fps: int,
    width: int,
    height: int,
    pool_length: float,
    pool_width: float,
    lane: str,
    swimmer_name: str,
    start_side: str,
) -> dict:
    horizontal_margin = width * 0.10
    top_y = height * 0.24
    bottom_y = height * 0.74
    src_pts = [
        [horizontal_margin, bottom_y],
        [width - horizontal_margin, bottom_y],
        [width - horizontal_margin, top_y],
        [horizontal_margin, top_y],
    ]

    return {
        "city": competition,
        "cup": competition,
        "distance": str(course_distance),
        "epreuve": course,
        "lignes": {lane: swimmer_name},
        "nage": course_type,
        "name": run_name,
        "ncamera": 1,
        "one_is_up": "False",
        "sexe": swimmer_sex,
        "start_side": start_side,
        "taille_piscine": [pool_length, pool_width],
        "csvFiles": [csv_name],
        "sourceSportsdata": {
            "format": "basic_tracking",
            "csv": source_csv_name,
            "columns": ["frameId", "swimmerId", "eventId", "time", "distance"],
            "lane": lane,
        },
        "videos": [
            {
                "destPts": [
                    [0, pool_width],
                    [pool_length, pool_width],
                    [pool_length, 0],
                    [0, 0],
                ],
                "fps": fps,
                "height": height,
                "name": video_name,
                "one_is_up": "False",
                "srcPts": src_pts,
                "start_flash": 0,
                "start_moment": 0,
                "start_side": start_side,
                "width": width,
            }
        ],
        "year": str(year),
    }


def main() -> int:
    args = parse_args()
    if args.fps <= 0:
        raise ValueError("--fps must be positive")
    if args.pool_length <= 0 or args.pool_width <= 0:
        raise ValueError("--pool-length and --pool-width must be positive")

    competition_name = derived_competition_name(args)
    run_name = derived_run_name(args)
    output_dir = resolve_output_dir(args, competition_name, run_name)
    output_dir.mkdir(parents=True, exist_ok=True)
    input_path = args.input.resolve() if args.input else ensure_default_input(output_dir)
    source_csv_path = copy_input(input_path, output_dir)
    rows = read_basic_tracking_csv(source_csv_path)

    csv_path = output_dir / f"{run_name}.csv"
    video_path = output_dir / f"{run_name}.mp4"
    metadata_path = output_dir / f"{run_name}.json"
    metadata = build_metadata(
        run_name=run_name,
        video_name=video_path.name,
        csv_name=csv_path.name,
        source_csv_name=source_csv_path.name,
        year=args.year,
        competition=args.competition,
        course_type=args.course_type,
        swimmer_sex=args.swimmer_sex,
        course_distance=args.distance,
        course=args.course,
        fps=args.fps,
        width=args.width,
        height=args.height,
        pool_length=args.pool_length,
        pool_width=args.pool_width,
        lane=args.lane,
        swimmer_name=args.swimmer_name,
        start_side=args.start_side,
    )

    aquanote_rows = build_aquanote_rows(
        rows=rows,
        lane=args.lane,
        swimmer_name=args.swimmer_name,
        pool_length=args.pool_length,
        pool_width=args.pool_width,
    )
    write_aquanote_csv(csv_path, aquanote_rows)
    actual_video_path = render_tracking_video(
        output_path=video_path,
        metadata=metadata,
        rows=rows,
        fps=args.fps,
        post_roll_seconds=args.post_roll_seconds,
        render_lanes=args.render_lanes,
    )
    metadata["videos"][0]["name"] = actual_video_path.name
    with metadata_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"competition: {competition_name}")
    print(f"run: {run_name}")
    print(f"sportsdata input: {display_path(source_csv_path)}")
    print(f"Aquanote CSV: {display_path(csv_path)}")
    print(f"metadata: {display_path(metadata_path)}")
    print(f"video: {display_path(actual_video_path)}")
    if not args.skip_flatdir:
        flat_json_path = args.flat_json.resolve()
        if regenerate_flat_json(flat_json_path):
            print(f"flat.json: {display_path(flat_json_path)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
