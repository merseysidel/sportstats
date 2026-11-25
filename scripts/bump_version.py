"""ბრაუზერის ქეშის გასაწმენდად: JS/CSS ფაილებს ახალ ვერსიას აწერს. გაუშვი ყოველი ცვლილების მერე."""
import glob, re, time
V = time.strftime("%Y%m%d%H%M")
for p in glob.glob("js/*.js"):
    s = open(p, encoding="utf-8").read()
    s = re.sub(r"from '\./([a-z]+)\.js(\?v=\w+)?'", lambda m: f"from './{m.group(1)}.js?v={V}'", s)
    open(p, "w", encoding="utf-8").write(s)
s = open("index.html", encoding="utf-8").read()
s = re.sub(r"js/app\.js(\?v=\w+)?", f"js/app.js?v={V}", s)
s = re.sub(r"css/style\.css(\?v=\w+)?", f"css/style.css?v={V}", s)
open("index.html", "w", encoding="utf-8").write(s)
print("ვერსია:", V)
