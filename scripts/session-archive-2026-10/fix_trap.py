# -*- coding: utf-8 -*-
import json, io

root = r"C:\Users\asus\.zcode\workspace\draft-77bf19d0-e626-4548-b57d-49a707907805\stray-kitty"
p = root + r"\web\content\events\events.json"
data = json.load(open(p, encoding="utf-8"))

def out(text, reward=None, td=None, flags=None, carry=None):
    o = {"text": text}
    if td is not None: o["tdMod"] = {"shadowPressure": td}
    if reward: o["reward"] = reward
    if flags: o["flags"] = flags
    if carry: o["carry"] = carry
    return o

e = next(x for x in data if x["id"] == "tunnel_false_kitten_trap")
e["category"] = "risk"
e["tags"] = ["trap", "shadow"]
e["options"] = [
    {"id": "mark_and_inspect", "label": "记下绊线位置,从上风口绕近检查",
     "outcomes": {
       "crit": out("你们从上风口贴过去,看清了全套机关:绊线连着一垛顶上压碎石的搁板,发条铁盒负责发声引猫——绊线、塌方、声音,三层套。路线画进脑子,回头在暗道图上给这里标了个大叉,后面的猫再也不会上当了。", {"clue": 2}, -1, ["false_kitten_trap_mapped"]),
       "success": out("绕到侧面的你们看清了机关全貌:绊线、塌方、诱饵声音,三件套齐活。记下位置,全员安全绕行。", {"clue": 1}, 0, ["false_kitten_trap_mapped"]),
       "partial": out("检查时蹭松了一根绊线,铁盒'喵'地叫了一声,头顶的碎石簌簌往下掉。你们加速通过,后背沾了一身灰。", None, 1, ["trap_almost_triggered"]),
       "fail": out("绕行时脚下滑了一步,绊线绷响!碎石灰尘当头砸下,你们连滚带爬冲出水雾区,直到灯下才敢回头——机关还在,但它知道有猫来过了。", {"clue": 1}, 1, ["trap_triggered"])
     }},
    {"id": "disarm_with_stick", "label": "用长草茎挑开绊线,拆掉机关",
     "outcomes": {
       "crit": out("草茎轻轻一挑,绊线脱落;再一发入魂,把发条铁盒的机括也卡死了。机关从此哑火——你们还顺手取下了铁盒里的完好音梳,这东西修修能当八音盒送给花房。", {"material": 2}, -1, ["trap_disarmed"], "bell"),
       "success": out("绊线挑断,铁盒哑了。这段路的陷阱解除,大家从容通过。", None, 0, ["trap_disarmed"]),
       "partial": out("绊线挑断了,铁盒却摔坏了外壳——音梳卡在壳里取不出。路保住了,战利品没拿成。", {"material": 1}, 0, ["trap_disarmed"]),
       "fail": out("草茎一触,绊线带动的不止一个机关——四面八方的铁盒同时响起猫叫,声音在暗道里汇成一片。你们耳朵嗡鸣着撤出这段路。", {"clue": 1}, 1, ["trap_chorus"])
     }},
    {"id": "momo_trapwalk", "label": "让墨墨示范一次'影子的过法'", "requireCat": "momo",
     "outcomes": {
       "crit": out("墨墨在黑影的地界里穿行如履平地,连绊线都绊不到他——他熟知影子的每一个机关习惯。示范完毕,他还顺手带回了机关对面藏着的物资:设陷阱的家伙,囤的东西也不少。", {"material": 2, "clue": 1}, -1, ["momo_trapwalk_demo"]),
       "success": out("墨墨示范了影子的过法:贴墙、避线、踩点。全队跟着他的脚印,安然通过——暗道独行侠的功课,今天全教了。", None, 0, ["momo_trapwalk_demo"]),
       "partial": out("墨墨带路通过,但教到一半他说:'影子会换新花样。'学得会这一次,学不会每一次。", {"clue": 1}, 0, ["momo_trapwalk_demo"]),
       "fail": out("示范到一半,墨墨忽然停住:'机关被换过了——这摆法不是我上次见的样子。'连他都判断不了的机关,大家决定不冒这个险。", {"clue": 1}, 1, ["trap_unknown_setup"])
     }}
]

io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
json.load(open(p, encoding="utf-8"))
print("trap 卡已升级为正规风险卡")
