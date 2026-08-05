import os

from flask import Flask, redirect, render_template, request

# api/index.py lives one level below the project root; templates/ and static/
# sit at the root (Vercel bundles them via includeFiles in vercel.json).
ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))

app = Flask(
    __name__,
    template_folder=os.path.join(ROOT, "templates"),
    static_folder=os.path.join(ROOT, "static"),
)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/personal")
@app.route("/global")
def legacy():
    return redirect("/")


# TEMPORARY: diagnosing a 404-on-every-path issue specific to the Vercel
# deployment (identical routes work fine under local `flask run`). Reports
# exactly what Flask/Werkzeug thinks the request path is, so we can see
# whether Vercel's rewrite is mangling PATH_INFO before it reaches Flask.
# Remove once the Vercel routing issue is fixed and confirmed.
@app.errorhandler(404)
def debug_404(_err):
    lines = [
        f"request.path = {request.path!r}",
        f"request.full_path = {request.full_path!r}",
        f"request.url = {request.url!r}",
        f"request.base_url = {request.base_url!r}",
        f"environ PATH_INFO = {request.environ.get('PATH_INFO')!r}",
        f"environ SCRIPT_NAME = {request.environ.get('SCRIPT_NAME')!r}",
        f"environ REQUEST_URI = {request.environ.get('REQUEST_URI')!r}",
        f"environ RAW_URI = {request.environ.get('RAW_URI')!r}",
        "",
        "registered rules:",
    ]
    for rule in app.url_map.iter_rules():
        lines.append(f"  {rule.rule}  ->  {rule.endpoint}")
    return "\n".join(lines), 404, {"Content-Type": "text/plain"}


if __name__ == "__main__":
    app.run(debug=True)
