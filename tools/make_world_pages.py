"""Writes pNN/world.html for every lesson from the settings below. Run from the repo root: python3 tools/make_world_pages.py
Each page: its worksheet parts (laid out by world/kinds.js), the questions the video's narrator already asks right
before it stops (said once only), and fixes to the lesson's questions (picture answers)."""
import json

PAGES = {
  "p45": dict(title="Pattern Path", sheet=dict(title="Patterns of Addition", parts=[
      dict(kind="vert",
           # as printed: null is an empty box on the page
           printed=[[[0, 0], [1, 1], [2, None], [None, None]],
                    [[3, 3], [2, 3], [1, None], [None, None]],
                    [[5, 1], [4, 1], [3, 1], [2, None], [1, None], [None, None]],
                    [[1, 0], [2, 0], [3, 0], [4, None], [5, None], [None, None]],
                    [[5, 0], [4, 1], [3, 2], [2, None], [1, None], [None, None]]],
           # the whole fact for every column, including "write the next fact"
           facts=[[[0, 0], [1, 1], [2, 2], [3, 3]],
                  [[3, 3], [2, 3], [1, 3], [0, 3]],
                  [[5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]],
                  [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]],
                  [[5, 0], [4, 1], [3, 2], [2, 3], [1, 4], [0, 5]]])]),
      quiz=dict(asked=["q1", "q2", "q3", "q7", "q8", "q9", "q10", "q11"])),
  "p46": dict(title="Graph Path", sheet=dict(title="Make a Graph", parts=[
      dict(kind="tallies", title="Count the facts for each sum.",
           facts=[["0 + 1 = 1", "1 + 0 = 1"],
                  ["0 + 2 = 2", "2 + 0 = 2", "1 + 1 = 2"],
                  ["0 + 3 = 3", "3 + 0 = 3", "1 + 2 = 3", "2 + 1 = 3"],
                  ["0 + 4 = 4", "4 + 0 = 4", "1 + 3 = 4", "3 + 1 = 4", "2 + 2 = 4"],
                  ["0 + 5 = 5", "5 + 0 = 5", "1 + 4 = 5", "4 + 1 = 5", "2 + 3 = 5", "3 + 2 = 5"]]),
      dict(kind="graph", title="Color the graph.", counts=[2, 3, 4, 5, 6], given=1),
      dict(kind="ask", title="Use the graph.", items=[
          dict(text="How many facts for the sum of 3?", say="How many facts are there for the sum of three?", ans=4,
               why="The answer is four. Look at the bar for three. It stops at four."),
          dict(text="Which number has the most facts?", say="Which number has the most facts? Look for the longest bar.", ans=5,
               why="The answer is five. The bar for five is the longest. It stops at six."),
          dict(text="Which number has the fewest facts?", say="Which number has the fewest facts? Look for the shortest bar.", ans=1,
               why="The answer is one. The bar for one is the shortest. It stops at two."),
          dict(text="How many facts for the sums of 3 and 1 together?", say="How many facts are there for the sum of three and the sum of one, all together?", ans=6,
               why="The answer is six. The sum of three has four facts. The sum of one has two facts. Start at four, and count on two more. {five... six.} So there are six facts in all.")])]),
      quiz=dict(asked=["q3", "q5", "q6", "q7", "q8"], fix={
          "q3": dict(choices=["t:1", "t:2", "t:3", "t:5"], oid="q3p"),
          "q4": dict(choices=["t:3", "t:4", "t:2", "t:6"], oid="q4p"),
          "q5": dict(choices=["g:green,1", "g:green,2", "g:green,3", "g:green,6"], oid="q5p")})),
  "p47": dict(title="Review Path", sheet=dict(title="Review", parts=[
      dict(kind="sums", title="Find the sum.",
           items=[[0, 0], [1, 1], [2, 2], [3, 3], [2, 3], [4, 2], [1, 0], [0, 2], [2, 1], [1, 3], [3, 2], [2, 4]]),
      dict(kind="pics", title="Write the addition sentences.", items=[[[3, 2], [1]], [[2], [2, 2]], [[1], [3, 2]], [[2, 2], [2]]]),
      dict(kind="makes", title="Write the sums of 5.", total=5),
      dict(kind="ask", items=[dict(text="How many facts are there for the sum of 5?", say="How many facts are there for the sum of five? Count the facts you wrote.", ans=6,
           why="The answer is six. Let's count the facts for the sum of five. {one... two... three... four... five... six.} There are six facts.")])]),
      quiz=dict(asked=["q5", "q6", "q7"])),
  "p48": dict(title="Domino Path", sheet=dict(title="Domino Facts", parts=[
      dict(kind="doms", title="Write the number facts.", items=[[0, 6], [1, 5], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]]),
      dict(kind="related", title="Add. Write the related addition fact.",
           items=[[2, 3], [1, 4], [2, 4], [1, 5], [1, 3], [2, 1], [4, 2], [4, 1], [3, 2], [1, 2], [3, 1], [5, 1]])]),
      quiz=dict(asked=["q6", "q7", "q8"])),
  "p49": dict(title="Circle Path", sheet=dict(title="Draw Circles to Add", parts=[
      dict(kind="mats", title="Draw circles to show the addition facts.",
           columns=[[[0, 0], [0, 1], [1, 0], [0, 2], [2, 0], [1, 1], [0, 3]],
                    [[3, 0], [1, 3], [3, 1], [0, 4], [4, 0], [1, 3], [3, 1]],
                    [[2, 2], [0, 5], [5, 0], [1, 4], [4, 1], [2, 3], [3, 2]],
                    [[0, 6], [6, 0], [1, 5], [5, 1], [2, 4], [4, 2], [3, 3]]],
           examples=[[0, 1], [0, 2]])]),
      quiz=dict(asked=["q2", "q4", "q8"], fix={
          "q2": dict(choices=["m:1,1", "m:2,1", "m:0,1", "m:3,1"], oid="q2p")})),
}

TPL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<link rel="apple-touch-icon" href="../icon.png">
<link rel="stylesheet" href="../app.css">
<link rel="stylesheet" href="../world/world.css">
<link rel="stylesheet" href="../pip.css">
<script src="../app.js"></script>
</head>
<body>
<div id="world"></div>
<audio id="voice" preload="auto"></audio>
<script>
// Page {page} as a walkable world. Made by tools/make_world_pages.py; change the settings there.
// The clips and questions come from index.html's QUIZ; the worksheet is page {page} as printed.
window.WORLD = {cfg};
</script>
<script src="../world/kinds.js"></script>
<script src="../world/world.js"></script>
<script src="../pip.js"></script>
</body>
</html>
"""
for pid, p in PAGES.items():
    page = int(pid[1:])
    cfg = dict(id=pid, page=page, sheet=p["sheet"], quiz=p["quiz"])
    open(f"{pid}/world.html", "w").write(TPL.format(title=p["title"], page=page, cfg=json.dumps(cfg)))
    print(pid)
