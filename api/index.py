import os

from flask import Flask, redirect, render_template

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


if __name__ == "__main__":
    app.run(debug=True)
