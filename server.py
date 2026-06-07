from flask import Flask, request, jsonify, send_from_directory
from urllib.parse import quote
import json
import os
import sys
import uuid
import threading
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", ".."))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

from skills.video.generate_video import generate_video  # noqa: E402

MODEL_MAP = {
    "budget": "alibaba/happy-horse/text-to-video",
    "balanced": "alibaba/happy-horse/text-to-video",
    "premium": "bytedance/seedance-2.0/fast/text-to-video",
}

app = Flask(__name__, static_folder="web", static_url_path="")

JOBS = {}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


def build_prompt(ingredients, dish_name):
    ing = ", ".join(ingredients[:6]) if ingredients else "fresh ingredients"
    return (
        f"A cinematic cooking sequence of making {dish_name}. "
        f"Start with close-up of raw ingredients ({ing}) on a wooden kitchen counter, "
        "then fast clean cuts of washing, slicing, stir-frying with steam and sizzling sound vibe, "
        "golden lighting, realistic food texture, chef hands plating the final dish, "
        "ending with beauty shot of the finished meal, shallow depth of field, 4K food commercial style."
    )


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.route("/api/generate", methods=["POST", "OPTIONS"])
def api_generate():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True)
    if payload is None:
        raw = (request.get_data(as_text=True) or '').strip()
        if raw:
            try:
                payload = json.loads(raw)
            except Exception:
                payload = {}
        else:
            payload = {}

    ingredients = payload.get("ingredients", [])
    dish_name = payload.get("dish", "a delicious homemade dish")
    model_tier = payload.get("model", "balanced")
    model = MODEL_MAP.get(model_tier, MODEL_MAP["balanced"])
    duration = int(payload.get("duration", 5))
    prompt = build_prompt(ingredients, dish_name)

    host_url = request.host_url.rstrip('/')

    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {
        "id": job_id,
        "status": "running",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "dish": dish_name,
        "prompt": prompt,
        "model": model_tier,
        "duration": duration,
        "error": None,
        "result": None,
    }

    def _run_job():
        try:
            result = generate_video(prompt=prompt, model=model, duration=duration)
            if not result.get("success"):
                JOBS[job_id]["status"] = "failed"
                JOBS[job_id]["error"] = result.get("error", "generation failed")
            else:
                local_path = result.get("local_path")
                rel = (local_path or "").replace("output/", "", 1)
                video_url = f"{host_url}/output/{quote(rel)}" if rel else None
                JOBS[job_id]["status"] = "done"
                JOBS[job_id]["result"] = {
                    "local_path": local_path,
                    "video_url": video_url,
                    "cost": result.get("cost", 0),
                    "file_size_mb": result.get("file_size_mb", 0),
                }
        except Exception as e:
            JOBS[job_id]["status"] = "failed"
            JOBS[job_id]["error"] = str(e)
        finally:
            JOBS[job_id]["updated_at"] = now_iso()

    threading.Thread(target=_run_job, daemon=True).start()

    return jsonify({
        "success": True,
        "job_id": job_id,
        "status": "running",
        "message": "Generation started",
    })


@app.get("/api/generate/<job_id>")
def api_generate_status(job_id):
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"success": False, "error": "job not found"}), 404

    if job["status"] == "done":
        return jsonify({
            "success": True,
            "status": "done",
            "job_id": job_id,
            "dish": job.get("dish"),
            "prompt": job.get("prompt"),
            **(job.get("result") or {}),
        })

    if job["status"] == "failed":
        return jsonify({
            "success": False,
            "status": "failed",
            "job_id": job_id,
            "error": job.get("error") or "generation failed",
        }), 500

    return jsonify({
        "success": True,
        "status": "running",
        "job_id": job_id,
        "dish": job.get("dish"),
        "created_at": job.get("created_at"),
    })


@app.route("/output/<path:filename>")
@app.route("/./output/<path:filename>")
def serve_output(filename):
    return send_from_directory(os.path.join(WORKSPACE_DIR, "output"), filename)


@app.get("/")
def root():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5173"))
    app.run(host="0.0.0.0", port=port)
