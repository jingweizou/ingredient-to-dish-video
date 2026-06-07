from flask import Flask, request, jsonify, send_from_directory
from urllib.parse import quote
import os
import sys

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

    payload = request.get_json(silent=True) or {}
    ingredients = payload.get("ingredients", [])
    dish_name = payload.get("dish", "a delicious homemade dish")
    model_tier = payload.get("model", "balanced")
    model = MODEL_MAP.get(model_tier, MODEL_MAP["balanced"])
    duration = int(payload.get("duration", 5))

    prompt = build_prompt(ingredients, dish_name)
    result = generate_video(prompt=prompt, model=model, duration=duration)

    if not result.get("success"):
        return jsonify({"success": False, "error": result.get("error", "generation failed")}), 500

    local_path = result.get("local_path")
    rel = (local_path or "").replace("output/", "", 1)
    video_url = f"{request.host_url.rstrip('/')}/output/{quote(rel)}" if rel else None

    return jsonify(
        {
            "success": True,
            "dish": dish_name,
            "prompt": prompt,
            "local_path": local_path,
            "video_url": video_url,
            "cost": result.get("cost", 0),
            "file_size_mb": result.get("file_size_mb", 0),
        }
    )


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
