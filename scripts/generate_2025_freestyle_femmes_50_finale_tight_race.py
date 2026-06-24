"""Generate an 8-lane 50m freestyle women's tight-race Aquanote demo.

The output is a variation of the 2025_courses_demo 50m freestyle final:
- eight female swimmers
- several lead changes until 25m
- one clear winner after 25m
- realistic final times around 25 seconds
- about 20 cycle annotations per swimmer
- one simple top-down video where cycle events blink as square markers
"""

from __future__ import annotations

import csv
import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


REPO_ROOT = Path(__file__).resolve().parent.parent
COMPETITION = "2025_courses_demo"
RUN_NAME = "2025_courses_demo_freestyle_femmes_50_finale"
OUTPUT_DIR = REPO_ROOT / "videos" / COMPETITION / RUN_NAME
FPS = 50
WIDTH = 1920
HEIGHT = 1080
POOL_LENGTH = 50.0
POOL_WIDTH = 20.0
LANE_COUNT = 8
RACE_SECONDS = 27.0

REGULAR_COLUMNS = [
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

BASIC_COLUMNS = ["frameId", "swimmerId", "eventId", "time", "distance"]

SWIMMERS = [
    "Camille Martin",
    "Lea Dubois",
    "Manon Bernard",
    "Ines Moreau",
    "Chloe Laurent",
    "Sarah Petit",
    "Emma Garnier",
    "Julie Rousseau",
]

# Final order: lane 4 wins clearly after 25m. The early pace factors create lead
# changes before mid-race without making the full-race speeds unrealistic.
LANE_PROFILES = [
    {"final_time": 25.42, "early_boost": 0.000, "mid_boost": 0.006, "cycle_offset": 0.02, "surges": [(0.42, 0.050, 0.080)]},
    {"final_time": 25.78, "early_boost": 0.000, "mid_boost": -0.012, "cycle_offset": -0.01, "surges": [(0.18, 0.065, 0.070)]},
    {"final_time": 25.30, "early_boost": 0.000, "mid_boost": 0.014, "cycle_offset": 0.01, "surges": [(0.48, 0.032, 0.080)]},
    {"final_time": 24.62, "early_boost": -0.028, "mid_boost": 0.052, "cycle_offset": -0.02, "surges": []},
    {"final_time": 25.66, "early_boost": 0.000, "mid_boost": -0.006, "cycle_offset": 0.00, "surges": [(0.30, 0.058, 0.075)]},
    {"final_time": 25.94, "early_boost": 0.000, "mid_boost": -0.020, "cycle_offset": 0.03, "surges": [(0.24, 0.042, 0.080)]},
    {"final_time": 26.08, "early_boost": -0.004, "mid_boost": -0.004, "cycle_offset": -0.03, "surges": [(0.36, 0.030, 0.070)]},
    {"final_time": 25.86, "early_boost": 0.000, "mid_boost": 0.000, "cycle_offset": 0.04, "surges": [(0.12, 0.048, 0.060)]},
]


@dataclass(frozen=True)
class TrackingEvent:
    frame_id: int
    swimmer_id: int
    swimmer_name: str
    lane: str
    time: float
    distance: float
    event: str
    event_id: int


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def distance_at_time(
    time_seconds: float,
    final_time: float,
    early_boost: float,
    mid_boost: float,
    surges: list[tuple[float, float, float]] | None = None,
) -> float:
    """Piecewise race model with early lead changes and late separation."""
    if time_seconds <= 0:
        return 0.0
    if time_seconds >= final_time:
        return POOL_LENGTH

    average_speed = POOL_LENGTH / final_time
    progress = time_seconds / final_time
    base_distance = average_speed * time_seconds

    early_shape = math.sin(math.pi * min(progress / 0.50, 1.0))
    late_shape = smoothstep((progress - 0.50) / 0.50)
    modifier = early_boost * early_shape + mid_boost * late_shape
    for center, amplitude, width in surges or []:
        modifier += amplitude * math.exp(-((progress - center) / width) ** 2)
    distance = base_distance * (1.0 + modifier)
    # Surges create lead changes, but only the explicit finish event reaches 50m.
    return max(0.0, min(POOL_LENGTH - 0.2, distance))


def find_time_for_distance(target_distance: float, profile: dict[str, float]) -> float:
    low = 0.0
    high = float(profile["final_time"])
    for _ in range(48):
        mid = (low + high) / 2.0
        if distance_at_time(
            mid,
            profile["final_time"],
            profile["early_boost"],
            profile["mid_boost"],
            profile.get("surges", []),
        ) < target_distance:
            low = mid
        else:
            high = mid
    return high


def event_distances() -> list[float]:
    # 20 cycles plus finish, with first cycle after the dive/reaction phase.
    return [round(2.4 * i, 2) for i in range(1, 21)] + [50.0]


def build_events() -> list[TrackingEvent]:
    events: list[TrackingEvent] = []
    for swimmer_id, (name, profile) in enumerate(zip(SWIMMERS, LANE_PROFILES)):
        lane = f"ligne{swimmer_id + 1}"
        lane_events = [
            TrackingEvent(
                frame_id=0,
                swimmer_id=swimmer_id,
                swimmer_name=name,
                lane=lane,
                time=0.0,
                distance=0.0,
                event="reaction",
                event_id=0,
            )
        ]

        for event_index, distance in enumerate(event_distances(), start=1):
            event = "finish" if math.isclose(distance, POOL_LENGTH) else "cycle"
            if event == "finish":
                time_seconds = float(profile["final_time"])
            else:
                time_seconds = find_time_for_distance(distance, profile) + float(profile["cycle_offset"])
            frame_id = int(round(time_seconds * FPS))
            lane_events.append(
                TrackingEvent(
                    frame_id=frame_id,
                    swimmer_id=swimmer_id,
                    swimmer_name=name,
                    lane=lane,
                    time=time_seconds,
                    distance=distance,
                    event=event,
                    event_id=event_index,
                )
            )

        lane_events.sort(key=lambda item: (item.frame_id, item.distance))
        events.extend(lane_events)

    return sorted(events, key=lambda item: (item.frame_id, item.swimmer_id, item.event_id))


def format_number(value: float | None) -> str:
    if value is None or not math.isfinite(value):
        return ""
    return f"{value:.2f}"


def regular_rows(events: list[TrackingEvent]) -> list[dict[str, str | int]]:
    rows: list[dict[str, str | int]] = []
    previous_by_swimmer: dict[int, TrackingEvent] = {}

    for event in events:
        previous = previous_by_swimmer.get(event.swimmer_id)
        delta_time = event.time - previous.time if previous else None
        delta_distance = event.distance - previous.distance if previous else None
        tempo = 2.0 * delta_time if delta_time and delta_time > 0 and event.event == "cycle" else None
        amplitude = 2.0 * delta_distance if delta_distance and delta_distance > 0 and event.event == "cycle" else None
        frequency = 60.0 / tempo if tempo else None
        speed = amplitude / tempo if amplitude and tempo else None
        lane_height = POOL_WIDTH / LANE_COUNT

        rows.append(
            {
                "frameId": event.frame_id,
                "swimmerId": event.swimmer_id,
                "swimmerName": event.swimmer_name,
                "lane": event.lane,
                "cumul": format_number(event.distance),
                "eventId": event.event_id,
                "eventX": format_number(POOL_LENGTH - event.distance),
                "eventY": format_number((event.swimmer_id + 0.5) * lane_height),
                "event": event.event,
                "TempsVideo (s)": format_number(event.time),
                "Temps (s)": format_number(event.time),
                "distance (m)": format_number(event.distance),
                "tempo (s)": format_number(tempo),
                "frequence (cylce/min)": format_number(frequency),
                "amplitude (m)": format_number(amplitude),
                "vitesse (m/s)": format_number(speed),
            }
        )
        previous_by_swimmer[event.swimmer_id] = event

    return rows


def basic_rows(events: list[TrackingEvent]) -> list[dict[str, str | int]]:
    return [
        {
            "frameId": event.frame_id,
            "swimmerId": event.swimmer_id,
            "eventId": event.event,
            "time": format_number(event.time),
            "distance": format_number(event.distance),
        }
        for event in events
    ]


def write_csv(path: Path, columns: list[str], rows: list[dict[str, str | int]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def pool_to_pixel(distance: float, lane_index: int) -> tuple[int, int]:
    left = 150
    right = WIDTH - 150
    top = 215
    bottom = HEIGHT - 215
    x = left + (distance / POOL_LENGTH) * (right - left)
    y = top + ((lane_index + 0.5) / LANE_COUNT) * (bottom - top)
    return int(round(x)), int(round(y))


def draw_base_pool() -> np.ndarray:
    frame = np.full((HEIGHT, WIDTH, 3), 242, dtype=np.uint8)
    left = 150
    right = WIDTH - 150
    top = 215
    bottom = HEIGHT - 215
    cv2.rectangle(frame, (left, top), (right, bottom), (238, 222, 182), -1)
    cv2.rectangle(frame, (left, top), (right, bottom), (0, 165, 255), 5)
    for i in range(1, LANE_COUNT):
        y = int(round(top + i * (bottom - top) / LANE_COUNT))
        cv2.line(frame, (left, y), (right, y), (170, 170, 170), 2)
    for i, name in enumerate(SWIMMERS):
        _, y = pool_to_pixel(0, i)
        cv2.putText(
            frame,
            str(i + 1),
            (left + 12, y + 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (45, 45, 45),
            2,
            lineType=cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            name.split()[0],
            (left + 42, y + 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (65, 65, 65),
            1,
            lineType=cv2.LINE_AA,
        )
    return frame


def create_video_writer(output_path: Path) -> tuple[cv2.VideoWriter, Path]:
    candidates = [
        (output_path, "avc1"),
        (output_path, "H264"),
        (output_path.with_suffix(".avi"), "MJPG"),
    ]
    for candidate, codec in candidates:
        writer = cv2.VideoWriter(
            str(candidate),
            cv2.VideoWriter_fourcc(*codec),
            FPS,
            (WIDTH, HEIGHT),
        )
        if writer.isOpened():
            return writer, candidate
        writer.release()
    raise RuntimeError("Could not create a video writer")


def finalize_video(actual_path: Path, requested_path: Path) -> Path:
    if actual_path.suffix.lower() == requested_path.suffix.lower():
        return actual_path.resolve()
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return actual_path.resolve()
    command = [
        ffmpeg,
        "-y",
        "-i",
        str(actual_path),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(requested_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return actual_path.resolve()
    actual_path.unlink(missing_ok=True)
    return requested_path.resolve()


def render_video(events: list[TrackingEvent], output_path: Path) -> Path:
    writer, actual_path = create_video_writer(output_path)
    base = draw_base_pool()
    events_by_swimmer: dict[int, list[TrackingEvent]] = {
        swimmer_id: sorted(
            [event for event in events if event.swimmer_id == swimmer_id],
            key=lambda event: event.time,
        )
        for swimmer_id in range(LANE_COUNT)
    }
    cycle_times = {
        (event.swimmer_id, event.frame_id)
        for event in events
        if event.event in {"cycle", "finish"}
    }
    total_frames = int(math.ceil(RACE_SECONDS * FPS))
    colors = [
        (220, 30, 30),
        (235, 115, 15),
        (225, 185, 15),
        (40, 170, 70),
        (30, 160, 190),
        (40, 85, 220),
        (130, 65, 185),
        (190, 55, 130),
    ]

    for frame_id in range(total_frames + 1):
        frame = base.copy()
        time_seconds = frame_id / FPS
        standings: list[tuple[float, int]] = []

        for swimmer_id, profile in enumerate(LANE_PROFILES):
            distance = distance_at_time(
                min(time_seconds, profile["final_time"]),
                profile["final_time"],
                profile["early_boost"],
                profile["mid_boost"],
                profile.get("surges", []),
            )
            standings.append((distance, swimmer_id))
            x, y = pool_to_pixel(distance, swimmer_id)
            nearest_cycle = min(
                (abs(frame_id - event.frame_id) for event in events_by_swimmer[swimmer_id] if event.event in {"cycle", "finish"}),
                default=999,
            )
            blinking = nearest_cycle <= 5 and (frame_id // 3) % 2 == 0
            size = 22 if blinking else 14
            color = (255, 255, 255) if blinking else colors[swimmer_id]
            cv2.rectangle(frame, (x - size, y - size), (x + size, y + size), color, -1)
            cv2.rectangle(frame, (x - size, y - size), (x + size, y + size), (35, 35, 35), 2)

        standings.sort(reverse=True)
        lead_distance, leader = standings[0]
        cv2.putText(
            frame,
            f"{time_seconds:05.2f}s  leader L{leader + 1}  {lead_distance:04.1f}m",
            (70, HEIGHT - 82),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (40, 40, 40),
            2,
            lineType=cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            "Blinking squares mark cycle annotations",
            (70, HEIGHT - 42),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.72,
            (80, 80, 80),
            2,
            lineType=cv2.LINE_AA,
        )
        writer.write(frame)

    writer.release()
    return finalize_video(actual_path, output_path)


def build_metadata(video_name: str, regular_csv_name: str, basic_csv_name: str) -> dict:
    return {
        "city": "Demo",
        "cup": "Demo",
        "distance": "50",
        "epreuve": "finale",
        "lignes": {f"ligne{i + 1}": name for i, name in enumerate(SWIMMERS)},
        "nage": "freestyle",
        "name": RUN_NAME,
        "ncamera": 1,
        "one_is_up": "True",
        "sexe": "femmes",
        "start_side": "left",
        "taille_piscine": [POOL_LENGTH, POOL_WIDTH],
        "csvFiles": [regular_csv_name],
        "sourceSportsdata": {
            "format": "basic_tracking",
            "csv": basic_csv_name,
            "columns": BASIC_COLUMNS,
        },
        "sportsdataFormats": {
            "basic": basic_csv_name,
            "tracking": regular_csv_name,
        },
        "videos": [
            {
                "destPts": [[0, POOL_WIDTH], [POOL_LENGTH, POOL_WIDTH], [POOL_LENGTH, 0], [0, 0]],
                "fps": FPS,
                "height": HEIGHT,
                "name": video_name,
                "one_is_up": "True",
                "srcPts": [[150, HEIGHT - 215], [WIDTH - 150, HEIGHT - 215], [WIDTH - 150, 215], [150, 215]],
                "start_flash": 0,
                "start_moment": 0,
                "start_side": "left",
                "type_video": "fixeDroite",
                "width": WIDTH,
            }
        ],
        "year": "2025",
    }


def update_flat_json() -> None:
    flat_path = REPO_ROOT / "videos" / "flat.json"
    if flat_path.exists():
        with flat_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    else:
        data = {}
    data.setdefault(COMPETITION, {})[RUN_NAME] = {
        "espadon": False,
        "espadonModifie": False,
        "data_checked": False,
    }
    with flat_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=4)
        handle.write("\n")


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    events = build_events()
    regular_csv = OUTPUT_DIR / f"{RUN_NAME}.csv"
    basic_csv = OUTPUT_DIR / "sportsdata_basic_tracking.csv"
    metadata_path = OUTPUT_DIR / f"{RUN_NAME}.json"
    video_path = OUTPUT_DIR / f"{RUN_NAME}.mp4"

    write_csv(regular_csv, REGULAR_COLUMNS, regular_rows(events))
    write_csv(basic_csv, BASIC_COLUMNS, basic_rows(events))
    actual_video_path = render_video(events, video_path)

    metadata = build_metadata(actual_video_path.name, regular_csv.name, basic_csv.name)
    with metadata_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    update_flat_json()

    print(f"run: {RUN_NAME}")
    print(f"metadata: {metadata_path.relative_to(REPO_ROOT)}")
    print(f"regular tracking CSV: {regular_csv.relative_to(REPO_ROOT)}")
    print(f"basic tracking CSV: {basic_csv.relative_to(REPO_ROOT)}")
    print(f"video: {actual_video_path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
