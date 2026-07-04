import os
import sys

from flask import Flask, abort, render_template

# api/index.py lives one level below the project root; templates/ and static/
# sit at the root (Vercel bundles them via includeFiles in vercel.json).
ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from charts import CHARTS  # noqa: E402

app = Flask(
    __name__,
    template_folder=os.path.join(ROOT, "templates"),
    static_folder=os.path.join(ROOT, "static"),
)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/personal")
def personal():
    return render_template("personal.html")


@app.route("/global")
def global_view():
    return render_template("global.html")


@app.route("/api/chart/<name>")
def chart_spec(name):
    builder = CHARTS.get(name)
    if builder is None:
        abort(404, description=f"Unknown chart '{name}'")
    return app.response_class(builder().to_json(), mimetype="application/json")


if __name__ == "__main__":
    app.run(debug=True)
