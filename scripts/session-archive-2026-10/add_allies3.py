# -*- coding: utf-8 -*-
import json, io

root = r"C:\Users\asus\.zcode\workspace\draft-77bf19d0-e626-4548-b57d-49a707907805\stray-kitty"

def patch(path, pairs):
    s = io.open(path, encoding="utf-8").read()
    for old, new in pairs:
        assert old in s, (path, old[:50])
        s = s.replace(old, new)
    io.open(path, "w", encoding="utf-8", newline="\n").write(s)

patch(root + r"\scripts\content.mjs",
      [("const CARRIES=['lantern','mirror','bell','box','dog','dove'];",
        "const CARRIES=['lantern','mirror','bell','box','dog','dove','rats','kitten'];")])
patch(root + r"\web\src\contracts\index.ts",
      [("carry?: 'lantern' | 'mirror' | 'bell' | 'box' | 'dog' | 'dove';",
        "carry?: 'lantern' | 'mirror' | 'bell' | 'box' | 'dog' | 'dove' | 'rats' | 'kitten';"),
       ("carry?: 'lantern' | 'mirror' | 'bell' | 'box' | 'dog' | 'dove'}",
        "carry?: 'lantern' | 'mirror' | 'bell' | 'box' | 'dog' | 'dove' | 'rats' | 'kitten'}")])
patch(root + r"\docs\openapi.json",
      [('"enum": ["lantern", "mirror", "bell", "box", "dog", "dove"],',
        '"enum": ["lantern", "mirror", "bell", "box", "dog", "dove", "rats", "kitten"],'),
       ('''              "dog",
              "dove"
            ],''',
        '''              "dog",
              "dove",
              "rats",
              "kitten"
            ],''')])
patch(root + r"\web\src\ui\EventResult.tsx",
      [("dog: '老黄', dove: '咕咕'} as const;",
        "dog: '老黄', dove: '咕咕', rats: '鼠群', kitten: '小猫'} as const;")])

p = root + r"\web\content\events\events.json"
data = json.load(open(p, encoding="utf-8"))
by = {e["id"]: e for e in data}

oc = next(o for o in by["rat_pipeline_event"]["options"] if o["id"] == "follow_crumbs")["outcomes"]["crit"]
oc["text"] = "爪印领着你们绕开了三处黑影盘踞的死角,猫粮的间隔不多不少正好一段路——这是一条被精心维护的友好通道。通道尽头,鼠王亲自等着,身后是一排竖着尾巴的管道小队:'这条道,我们也守一份。下一场你们要是动手,管道里,会有我们的动静。'"
oc["carry"] = "rats"

oc = next(o for o in by["warm_nest_event"]["options"] if o["id"] == "leave_food_note")["outcomes"]["crit"]
oc["text"] = "猫粮补满,小花放好。等你们巡查回来,窝边的猫粮少了一半,小花被挪到了窝口最显眼的位置——它收到了。而当你们转身走向深处的战斗,身后传来轻轻的一声跟步:它跟上来了,瘦了些,眼睛却亮。'下一场,算我一份。'"
oc["carry"] = "kitten"

io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
json.load(open(p, encoding="utf-8"))
print("lint/契约/openapi/UI + 两卡 crit 升级完成")
