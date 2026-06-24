# StrokeIQ

StrokeIQ is a swimming video annotation and analysis project based on Aquanote. It helps annotate swimming race videos, export cumulative-distance CSV data, and review stroke metrics such as cycle distance, tempo, frequency, and speed.

_Original Aquanote description: an annotation tool for race swimming videos using one or multiple static cameras._

<img src="https://centralelyon.github.io/swimming/figures/aquanote.png" alt="Aquanote screenshot" style="max-width:100%;height:auto;">

## How to install

### Using `venv` (recommended)

1. **Create a virtual environment:**

```bash
python -m venv venv
```

2. **Activate the environment:**

* On macOS/Linux:

```bash
source venv/bin/activate
```
* On Windows:

```bash
venv\Scripts\activate
```

3. **Install the module:**

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

4. **Install the JavaScript dependencies:**

```bash
npm install
```

## Basic usage

There are 3 main ways to run Aquanote:

1. Static mode, using the bundled `videos/flat.json` index and local files. This is the mode used for GitHub Pages.
2. Local Python server mode, using `local.py` to serve local competition data from `videos/`.
3. API mode, using a VizAPI-compatible backend.

Use **Static** for read-only demos and GitHub Pages, **Local Python server** for local annotation work and metadata writes, and **API** when Aquanote is connected to a shared backend. The application also has a **Configuration** tab where you can switch modes and set the local server or API URL without editing the code.

### Static mode

Static mode does not need the Python API. It serves the web app and reads the demo data directly from the repository.

```bash
npm start
```

Then open:

```text
http://127.0.0.1:8001/?source=static
```

In static mode, Calibrate and Metadata can update the current browser session, but saving JSON back to disk requires the local Python server or an API backend.

To refresh the static index after adding competitions or runs, regenerate `videos/flat.json`:

```bash
python -m flatdir videos --limit 10 --nested --only type=directory --add espadon=false --add espadonModifie=false --add data_checked=false --no-defaults --min-depth 1 --add-depth 2 --ignore-typical > videos/flat.json
```

### Local Python server

Use this mode when you want to serve local files from the repository `videos/` folder with the small Flask server in `local.py`.

In one terminal, start the local data server on port `8000`:

```bash
python local.py --port 8000
```

In another terminal, start the web app on port `8001`:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:8001/?source=local
```

If the local server uses a different URL, set it in the Configuration tab or pass it in the URL:

```text
http://127.0.0.1:8001/?source=local&localServerUrl=http%3A%2F%2F127.0.0.1%3A8010
```

Local competitions must be present in `videos/`. Competition and run folder names should start with `2` so they are detected by the dropdown filters. Keep the expected underscore `_` structure in folder names to avoid display issues in the race dropdown menus.


### API mode

API mode expects a backend that exposes Aquanote through the `/aquanote` prefix, such as the VizAPI module:

https://github.com/centralelyon/VizAPI/tree/main/app/modules/aquanote

Start that API separately so it is available at:

```text
http://localhost:8000/aquanote
```

Then start the web app:

```bash
npm start
```

Open:

```text
http://127.0.0.1:8001/?source=api
```

If the API is not at `http://localhost:8000/aquanote`, set it in the Configuration tab or pass it in the URL:

```text
http://127.0.0.1:8001/?source=api&apiUrl=http%3A%2F%2Flocalhost%3A9000%2Faquanote
```

The API provider uses these endpoints:

```text
GET /aquanote/getCompets
GET /aquanote/getRuns/{compet_id}
GET /aquanote/getDatas/{compet_id}/{run_id}
GET /aquanote/getQuality/{compet_id}/{run_id}
GET /aquanote/files/{compet_id}/{run_id}/{filename}
```

### Sportsdata CSV formats

The Configuration tab has two Sportsdata CSV options:

* **Sportsdata load schema** filters the CSV files shown for the selected run. Aquanote validates CSV headers in the current run folder against the selected Sportsdata swimming schema before adding them to the data dropdown. Static mode can only discover files listed in metadata or `flat.json`.
* **Sportsdata save format** controls the columns used by the download button. The default is **Swimming tracking CSV**; **Swimming basic tracking CSV** writes `frameId,swimmerId,eventId,time,distance`.


## Data structure and analysis

### Structure of annotated data 

Aquanote uses a specific data structure to store the annotations. It is based on a CSV file for each video, with samples provided in the [`videos`](videos/2025_courses_demo/2025_courses_demo_translation_carre_100_demifinale) folder. Here is a sample of such a CSV file:

```
frameId,swimmerId,swimmerName,lane,cumul,eventId,eventX,eventY,event,TempsVideo (s),Temps (s),distance (m),tempo (s),frequence (cylce/min),amplitude (m),vitesse (m/s)
63,4,ligne5,ligne5,3.90,0,46.1036,8,cycle,1.36,1.26,3.90,,,,
113,4,ligne5,ligne5,6.87,1,43.1305,8,cycle,2.36,2.26,6.87,2.00,30.00,5.95,2.97
```

### Analysis of annotated data 

To analyse the CSV file, a dedicated repository is available:

**[aquanalysis](https://github.com/centralelyon/aquanalysis)** is a repository that contains scripts and notebooks to compute various performance metrics from the annotated data, such as speed, stroke rate, and stroke length.

### Adding new videos

The videos provided is in the `videos` folder are samples. To add your own videos, you need to follow the same structure as in the demo folder. 

Each competition should have its own subfolder, and then videos to used should be specified in a `metadata JSON` file located at the root of each competition folder. For example, for the demo competition the metadata file is `2025_courses_demo_translation_carre_50_finale`, 

**[flatdir](https://github.com/centralelyon/flatdir)** is a Python module to flatten a directory structure and automatically generate the required JSON files at the root of each competition folder (like the [`videos/flat.json`](videos/flat.json) JSON, add `> flat.json` to save the output in such a file):

> python -m flatdir videos --limit 10 --nested --only type=directory --add espadon=false --add espadonModifie=false --add data_checked=false --no-defaults --min-depth 1 --add-depth 2 --ignore-typical > videos/flat.json

### Pre-processing videos

A `metadata JSON` contains information about pre-processing steps for each race to analyzed and should be created before the annotation phase. This includes temporal calibration (start and end times), spatial calibration (real-world dimensions) and athletes information (names, lanes). An example of such a JSON file is available in the demo folder: [`videos/2025_courses_demo/2025_courses_demo_translation_carre_50_finale/2025_courses_demo_translation_carre_50_finale.json`.](videos/2025_courses_demo/2025_courses_demo_translation_carre_50_finale/2025_courses_demo_translation_carre_50_finale.json).

While some pre-processingt steps can be done directly in Aquanote, some require external video and image processing tools. We suggest two tools to achieve this: 

[**ntt**](https://github.com/centralelyon/ntt/) for image and video processing using warppers around **OpenCV** and **FFmpeg** libraries (for instance).

[**pipeoptz**](https://github.com/centralelyon/pipeoptz/) to orchestrate such processing as pipelines and eventually optimize their parameters automatically.

### Synthetic video generation

The repository includes a helper script to generate a synthetic video from a race metadata JSON using the stored homography:

```sh
pip install -r scripts/requirements.txt
python scripts/generate_video.py
```

This uses the demo `50_finale` metadata by default and writes `output_video.mp4` when MP4 encoding is available, otherwise it falls back to `output_video.avi`.

To use another metadata file or output path:

```sh
python scripts/generate_video.py \
  --metadata videos/2025_courses_demo/2025_courses_demo_translation_carre_100_demifinale/2025_courses_demo_translation_carre_100_demifinale.json \
  --output demo_homography.mp4
```

To render the swimming lanes and lane labels on top of the generated frames:

```sh
python scripts/generate_video.py --render-lanes
```

### Sportsdata basic tracking with a camera

To generate Aquanote assets from a sportsdata basic tracking CSV with a side-pool
camera perspective:

```sh
python scripts/generate_sportsdata_basic_tracking_camera.py
```

By default the script writes two side-pool videos, one for the left part of the
pool and one for the right part, with overlap:

```text
{run_name}_fixeGauche.mp4
{run_name}_fixeDroite.mp4
```

Each video entry in the generated metadata has `type_video` set to
`fixeGauche` or `fixeDroite`. The camera payload is written as
`sportsdata_basic_tracking_camera.json` next to the generated videos, CSV, and
metadata. A runnable two-camera example is available at:

```sh
scripts/example_generate_sportsdata_two_cameras.sh
```

To generate a single video and pass your own camera:

```sh
python scripts/generate_sportsdata_basic_tracking_camera.py \
  --single-camera \
  --camera my_camera.json
```

Camera JSON format:

```json
{
  "fov": 55,
  "aspect": 1.777778,
  "near": 0.01,
  "far": 1000,
  "position": [25, 17, -25],
  "target": [25, 0, 10],
  "up": [0, 1, 0],
  "roll": 0
}
```


## Documentation  

All documentation can be viewed by launching the **index** file in the `html` folder, in particular the documentation for the main code located in `/assets/js`. This opens a page in your browser with sorted information about the code.  

This documentation was generated via **Doxygen** (the `doxyfile` contains its settings). It is not as effective for JavaScript as it is for other languages, so it relies heavily on comments (and their spelling mistakes).  

Some folders are not visible in VS Code because they are hidden in `.vscode/settings.json`. This is meant to declutter the visible files, but feel free to modify this file.  


## Acknowledgments

<img src="https://liris.cnrs.fr/sites/default/files/logo_liris_160_0.png" style="height:50px">&nbsp;&nbsp;&nbsp;<img src="https://www.ec-lyon.fr/sites/default/files/styles/paragraph_image/public/content/paragraphs/images/2024-10/2024_logo-centrale-h_rouge_rvb.jpg.webp" style="height:50px">&nbsp;&nbsp;&nbsp;<img src="https://www.natation-handisport.org/wp-content/uploads/2021/10/logo_NePTUNE_color-768x204.png" style="height:50px">
