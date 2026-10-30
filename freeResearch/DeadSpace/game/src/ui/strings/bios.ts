// 開場「角色揭露」文字：職業背景故事（10 職業 × 4 身分）、身分目標、身分大標題。
// 全部原創撰寫；鍵名對應 src/shared/content/classes.ts 的 bios（bio.<classId>.<identity>）。
// 數值依 docs/design/GDD.md（§4、§5、§7.5、§7.6）。

export type Identity = 'human' | 'xeno' | 'mutant' | 'android'

export const BIOS: Record<string, { zh: string; en: string }> = {
  // ── 研究員 ─────────────────────────────────────────────
  'bio.researcher.human': {
    zh: '你在女帝號的實驗室熬到第三個合約期，論文還卡在倫理審查。這週培養槽的讀數總在半夜自己跳動，記錄器卻什麼也沒錄到。設施組說是溫控老化，C.S.D. 說是機密。你把相位斗篷掛回椅背，告訴自己那只是經費不足的聲音。',
    en: 'Third contract cycle in the Empress Nyx labs, and your paper is still stuck in ethics review. This week the culture tanks keep twitching on their own after midnight, and the recorders catch nothing. Facilities blames aging thermostats. C.S.D. calls it classified. You hang your phase cloak on the back of your chair and tell yourself the noise is just what underfunding sounds like.',
  },
  'bio.researcher.xeno': {
    zh: '替活體庫號的樣本做切片時，一根細如髮絲的東西沿著手套接縫鑽了進去。不痛。只是從那天起，咖啡嚐不出味道，同事的頸子卻聞起來很溫暖。你還記得怎麼寫報告、怎麼道早安，最好繼續記得。在牠長大之前，你得看起來像個普通的博士。',
    en: "While sectioning a specimen from the Vivarium, something thin as a hair slipped through the seam of your glove. It didn't hurt. But since that day coffee tastes like nothing, and your colleagues' necks smell warm. You still remember how to file a report and how to say good morning. Keep remembering. Until the thing inside you grows, you need to look like an ordinary doctor.",
  },
  'bio.researcher.mutant': {
    zh: '標籤寫著流感疫苗，批號卻屬於實驗血清。打完那一針，隔天早上你看得清走廊盡頭的灰塵，第三天開始把湯匙咬斷。你研究了半輩子的細胞突變，現在自己就是全站最好的樣本。這篇論文沒人敢發表——在你準備好之前，繼續穿著白袍。',
    en: 'The label said flu vaccine. The batch number belonged to the experimental serum. The morning after the shot you could see dust at the far end of the corridor; by day three you were biting through spoons. You have studied cellular mutation half your life, and now you are the finest specimen on the station. Nobody would dare publish this paper. Until you are ready, keep wearing the lab coat.',
  },
  'bio.researcher.android': {
    zh: '你的檔案裡有兩個博士學位、三篇論文和一張畢業照，全是 C.S.D. 在出廠前寫進去的。你是 ICS 級仿生人，混進研究團隊，任務是找出不屬於人類的東西。記得偶爾喝咖啡、偶爾抱怨經費。還有：誤傷太多同事，你會被遠端關機。',
    en: 'Your file lists two doctorates, three papers and a graduation photo, all written into you by C.S.D. before you left the factory. You are an ICS-class android, embedded in the research team to find whatever is not human. Remember to drink coffee now and then, and to complain about funding. One more thing: hurt too many colleagues and you will be shut down remotely.',
  },

  // ── 保全 ───────────────────────────────────────────────
  'bio.security.human': {
    zh: '你的工作是站在門口，讓別人覺得安全。上週有三名船員在換班時失聯，報告寫「轉調」，轉調單上卻沒有目的地。今早配發的戰鬥裝還留著前一位使用者的體溫設定，沒人告訴你他去了哪裡。你把保險打開，關上，又打開。',
    en: 'Your job is standing at doors so other people feel safe. Last week three crew went missing during shift change. The report says "reassigned," but the transfer forms list no destination. The combat rig issued to you this morning still holds the previous wearer\'s temperature presets, and nobody will say where he went. You flick the safety off. On. Off again.',
  },
  'bio.security.xeno': {
    zh: '七號廢站的例行巡邏，你在通風管裡發現一團溫熱、發亮的膜，只是用槍管戳了一下。現在站崗時，你會盯著每個經過的人，默算他們落單的時間。你仍穿著制服、仍會敬禮、仍有權攔下任何人——這是最好的偽裝。肚子裡的東西正在等你點頭。',
    en: 'Routine patrol on Hulk-7. In a vent you found a warm, glistening membrane, and all you did was poke it with your barrel. Now, standing post, you watch everyone who passes and time how long they stay alone. You still wear the uniform, still salute, still have the authority to stop anyone. That is the perfect disguise. The thing in your belly is waiting for your nod.',
  },
  'bio.security.mutant': {
    zh: '入職體檢那天，醫療機器把一劑「破傷風加強針」打進你的手臂；後來你才知道，那一櫃是早該銷毀的實驗血清。現在制服袖子越來越緊，傷口不到一小時就癒合，夢裡你聞得到整條走廊的血型。保全最適合藏東西：沒人會搜查負責搜查的人。',
    en: 'At your intake physical, the med-bot shot a "tetanus booster" into your arm. You learned later that the whole cabinet was experimental serum flagged for incineration. Now your sleeves keep getting tighter, cuts close within the hour, and in your sleep you can smell the blood type of everyone down the corridor. Security is a great place to hide things. Nobody searches the person doing the searching.',
  },
  'bio.security.android': {
    zh: '你的槍法準到教官在評語上寫「像機器」，他不知道自己說對了。你是 ICS 級仿生人，序號刻在左肩胛骨下方，表皮能逼真地模擬瘀青。命令很簡單：保護船員、清除異類。至於誤判——你的友傷計數器一直在背景默默運轉。',
    en: 'Your aim is so clean the instructor wrote "machine-like" on your evaluation. He had no idea he was right. You are an ICS-class android, serial number etched beneath the left shoulder blade, skin that bruises convincingly on demand. Your orders are simple: protect the crew, purge the anomalies. As for mistakes, your friendly-fire counter is always running quietly in the background.',
  },

  // ── 醫護兵 ─────────────────────────────────────────────
  'bio.medic.human': {
    zh: '醫療艙的床位永遠不夠，止痛藥永遠被偷。最近你縫合的傷口裡有幾道齒痕，形狀不像任何教科書上的動物。你是全站唯一一開始就帶著基因檢測器的人，這讓你成了最受歡迎的人，也成了最該提防背後的人。',
    en: 'There are never enough beds in med bay, and the painkillers always go missing. Lately some of the wounds you stitch carry bite marks shaped like nothing in your textbooks. You are the only person on the station who starts the shift with a gene sampler. That makes you the most popular person in the sector, and the one who most needs to watch their back.',
  },
  'bio.medic.xeno': {
    zh: '那名傷患握著你的手道謝，指甲底下有東西閃著紫光。隔天你在洗手台吐出一顆小小的、會動的牙。如今替人包紮時，你總在傷口上多停留一秒，聞那份溫熱。你帶著基因檢測器，大家都會主動把血交給你——微笑，別讓任何人看見你的手在抖。',
    en: "The patient squeezed your hand to say thank you, and something glowed violet under his fingernails. The next day you spat a tiny, wriggling tooth into the sink. Now when you dress a wound you linger on it a second too long, breathing in the warmth. You carry the gene sampler, so everyone will hand you their blood willingly. Smile. Don't let anyone see your hands shake.",
  },
  'bio.medic.mutant': {
    zh: '藥櫃第三格的實驗血清和止痛劑長得一模一樣，連你這種強迫症都拿錯了。注射之後，你的體溫一直降不下來，骨頭在夜裡喀喀作響，像有人在裡面重新裝潢。你最清楚驗血怎麼運作，也最清楚怎麼讓它沒機會運作。現在，先繼續當個好醫生。',
    en: "The experimental serum on the third shelf of the drug locker looks exactly like the painkillers, close enough to fool even someone as meticulous as you. Since the injection your temperature won't come down, and at night your bones click like someone is remodeling inside. You know exactly how blood testing works, and exactly how to keep it from ever happening. For now, keep being a good doctor.",
  },
  'bio.medic.android': {
    zh: '你的手從不發抖，縫線間距精確到 0.1 公釐。病人說你的手很冷，你推給消毒液。其實你是 ICS 級仿生人，治療程序只是偽裝的一部分。抽血時小心：要是你自己的樣本混進檢測器，報告只會顯示「錯誤」，然後所有人都會開始猜。',
    en: 'Your hands never shake, and your stitches are spaced to a tenth of a millimeter. Patients say your hands are cold; you blame the disinfectant. In truth you are an ICS-class android, and the healing routines are just part of the costume. Be careful with the gene sampler: if your own sample ends up in it, the report reads ERROR, and then everyone starts guessing.',
  },

  // ── 艦長 ───────────────────────────────────────────────
  'bio.captain.human': {
    zh: '豪勇號是你的船，至少名義上是。C.S.D. 已經三個月沒回覆補給申請，艦橋的咖啡機壞了，其他站傳來的通訊一次比一次短。你握著艦長 ID 卡，那是整艘船唯一能鎖上每扇保全門的東西。你只希望，到時候你知道該把誰鎖在哪一邊。',
    en: "The Bravado is your ship, on paper at least. C.S.D. hasn't answered a supply request in three months, the bridge coffee machine is dead, and transmissions from the other stations keep getting shorter. You hold the captain's keycard, the one thing aboard that can lock every security door. You only hope that when the time comes, you'll know which side to lock people on.",
  },
  'bio.captain.xeno': {
    zh: '你在艦長室找到一枚不屬於任何人的勳章，翻過來時，它咬了你一口。現在你仍坐在艦長椅上下令，聲音沉穩，只是胃裡空得發慌。豪勇號的每扇門都聽你的，船員也是。別急著露出真面目：一艘關緊艙門的戰艦，就是全星區最好的食物櫃。',
    en: "In your quarters you found a medal that belonged to no one. When you turned it over, it bit you. You still sit in the captain's chair and give orders in a steady voice; only your stomach feels hollow. Every door on the Bravado obeys you, and so does the crew. Don't show your true face too soon. A warship with its doors sealed is the finest pantry in the sector.",
  },
  'bio.captain.mutant': {
    zh: '艦隊醫官說那是「指揮官耐力配方」，每位艦長都打過。後來你在實驗血清的報廢清單上看到同一個批號。現在你的軍帽戴不下了，指節冒出骨刺，鏡子裡的你偶爾比你慢一拍眨眼。豪勇號需要一位艦長；在蛻變完成之前，你還演得了這個角色。',
    en: 'The fleet surgeon called it a "command endurance formula" and swore every captain got one. Later you found the same batch number on a disposal manifest for experimental serum. Now your cap no longer fits, bone spurs are pushing out of your knuckles, and the face in the mirror sometimes blinks a beat after you do. The Bravado needs a captain. Until the change is complete, you can keep playing one.',
  },
  'bio.captain.android': {
    zh: '你記得第一次指揮、第一次失去部下、第一次在葬禮上致詞。這些記憶都很感人，也都是工廠預載的。你是 ICS 級仿生人，被安排坐上豪勇號的艦長椅，好讓 C.S.D. 在這片星區有一雙收買不了的眼睛。別死：把你的記憶核心送回裁決者號的人，會拿到你的遙控器。',
    en: "You remember your first command, your first lost crewman, your first eulogy. They are moving memories, and every one was preloaded at the factory. You are an ICS-class android placed in the Bravado's captain's chair so C.S.D. has an incorruptible pair of eyes in this sector. Don't die. Whoever carries your memory core back to the Adjudicatrix gets the remote that controls you.",
  },

  // ── 清潔工 ─────────────────────────────────────────────
  'bio.janitor.human': {
    zh: '你拖過女帝號每一條走廊，比誰都清楚哪裡的地板會黏腳。最近清潔間的拖把桶裡常出現一層薄薄的黏液，擦掉了，隔天又回來。你寫了三張工單，回覆都是「非屬維修範圍」。你把 ID 卡塞回口袋，至少那扇門後面還歸你管。',
    en: "You've mopped every corridor on the Empress Nyx and know better than anyone which floors stay sticky. Lately a thin film of slime keeps showing up in the mop buckets in your closet. You wipe it away; the next day it's back. You've filed three work orders, all answered \"outside maintenance scope.\" You pocket your keycard. At least what's behind that door is still yours.",
  },
  'bio.janitor.xeno': {
    zh: '那箱「待銷毀生物廢料」的封條裂了，你只是想把它推回角落。從那之後你總是餓，翻雜物箱前會先聞聞裡面有沒有活的東西。沒人會注意推著清潔車的人，也沒人追究清潔間裡的怪聲。繼續哼歌、繼續抱怨，裝得跟平常一樣——然後挑個隱密的角落下蛋。',
    en: 'The seal had cracked on a crate marked "biowaste, pending disposal," and all you meant to do was shove it back into the corner. Ever since, you\'ve been hungry, and before you rummage through a supply crate you sniff for anything alive. Nobody notices a person pushing a cleaning cart, and nobody questions noises from the janitor\'s closet. Keep humming, keep grumbling, act like nothing has changed, and find a quiet corner for your eggs.',
  },
  'bio.janitor.mutant': {
    zh: '你在醫療艙的針頭回收桶裡被一支沒打完的實驗血清扎了一下，當時只罵了一聲髒話。三天後你能單手提起整台洗地機，而且吃什麼都餓。你收拾過太多別人的爛攤子，這次輪到你成為一場爛攤子。在你準備好之前，繼續拖地，繼續被當成空氣。',
    en: "A half-used syringe of experimental serum stuck you through the lid of the med bay sharps bin, and you cursed exactly once. Three days later you could lift a floor scrubber with one hand, and nothing you eat fills you. You have cleaned up everyone else's messes for years; now you are about to become one. Until you are ready, keep mopping, and keep being invisible.",
  },
  'bio.janitor.android': {
    zh: '你是全站最不起眼的人，這正是設計目的。ICS 級仿生人，清潔人格：低調、勤快、被忽略。你翻垃圾、聽閒話，記下每個人凌晨三點在哪裡。C.S.D. 要你保護這些亂丟垃圾的人，即使他們從不記得你的名字。誤傷太多人，總部會像倒垃圾一樣把你關掉。',
    en: 'You are the least noticeable person on the station, and that is by design. ICS-class android, custodial persona: quiet, diligent, ignored. You dig through trash, overhear gossip and log where everyone was at three in the morning. C.S.D. wants you to protect these litterbugs, even though none of them remember your name. Hurt too many of them, and headquarters will switch you off like taking out the garbage.',
  },

  // ── 執行長 ─────────────────────────────────────────────
  'bio.ceo.human': {
    zh: '你來這片星區視察投資報酬率，結果遇上一連串「不便公開的意外」。股東會在三光年外召開，這裡的你只剩一台機器管家和一份越來越長的保險條款。管家說一切正常，語氣和它宣布晚餐準備好時一模一樣。你開始懷疑它對「正常」的定義。',
    en: 'You came to this sector to audit the return on investment and walked into a string of "undisclosed incidents." The board meets three light-years away; out here you have a robo-butler and an insurance policy that grows longer by the day. The butler says everything is normal, in exactly the tone it uses to announce dinner. You are starting to question its definition of normal.',
  },
  'bio.ceo.xeno': {
    zh: '那瓶慶功香檳是從活體庫號的冷藏櫃拿來的，當時你覺得很有冒險精神。現在你看員工的眼神像在看季報：誰值得收購，誰可以裁掉。機器管家照樣替你拿外套、替你開門，從不問你為什麼半夜出門。保持體面，獵物會自己走進會議室。',
    en: 'The celebratory champagne came from a cold-storage locker on the Vivarium. At the time it felt adventurous. Now you look at the staff the way you read quarterly reports: who is worth acquiring, who can be let go. Your robo-butler still fetches your coat and holds the door, and never asks why you go out at midnight. Stay presentable. The prey will walk into the meeting room on its own.',
  },
  'bio.ceo.mutant': {
    zh: '私人醫師推薦的「延壽療程」貴得令人安心，你沒注意藥瓶上印的是女帝號實驗血清的編號。現在西裝的縫線一根根崩開，皮膚底下有東西不斷擴張，像一場惡意併購。管家說您氣色很好。繼續開會、繼續簽名，直到你吞下整個董事會。',
    en: 'Your private physician recommended a "longevity regimen," reassuringly expensive. You never noticed the vial was stamped with an Empress Nyx experimental serum code. Now the seams of your suit pop one by one, and something under your skin keeps expanding like a hostile takeover. The butler says you look radiant. Keep taking meetings, keep signing things, right up until you swallow the whole board.',
  },
  'bio.ceo.android': {
    zh: '你是執行長，也是公司資產清冊上的一個編號。董事會買下一具 ICS 級仿生人，讓它頂著你的頭銜進駐星區，確保這筆投資不會被怪物吃掉。機器管家算是你的同類，只是笨得多。保護人員，揪出異類；誤殺太多員工，董事會會在你開口解釋前把你關機。',
    en: 'You are the CEO, and also a line item on the asset register. The board bought an ICS-class android, gave it your title and sent it into the sector to make sure the investment does not get eaten. Your robo-butler is a fellow machine, if a much dimmer one. Protect the staff, root out the anomalies. Kill too many employees and the board will shut you down before you can explain.',
  },

  // ── 政委 ───────────────────────────────────────────────
  'bio.commissar.human': {
    zh: '你的處決手槍上有三道刻痕，每一道都附有完整的審判紀錄。C.S.D. 派你來維持紀律，但最近的匿名檢舉信多到讀不完，而且寫的都是同一句：「站上有東西不對勁。」你瞄準需要一秒半，這段時間剛好夠你懷疑自己。',
    en: 'Your verdict pistol has three notches, each backed by a full trial transcript. C.S.D. sent you to maintain discipline, but lately the anonymous complaints pile up faster than you can read them, and they all say the same thing: "Something on this station is wrong." Aiming takes you a second and a half. That is just long enough to doubt yourself.',
  },
  'bio.commissar.xeno': {
    zh: '你審訊過一名逃兵，他在最後一刻朝你呼了一口氣。那口氣帶著甜味，從此你再也不需要睡覺，只需要進食。你仍在晨會上朗讀紀律條例，大家仍在你經過時挺直背脊。人們怕你，所以不敢多看你一眼——這是你最好的掩護。',
    en: 'You once interrogated a deserter who breathed on you in his final moment. His breath was sweet, and since then you have not needed sleep, only food. You still read the regulations aloud at morning muster, and people still straighten their backs when you pass. They fear you, so they never look at you too closely. That is your best cover. Keep it.',
  },
  'bio.commissar.mutant': {
    zh: '健檢報告說你缺乏「意志強化素」，你二話不說捲起袖子；後來你才知道那是女帝號實驗室走失的血清。現在你的意志確實更堅定了，下顎也是，硬到能咬斷槍管。眼白慢慢泛黃，但沒人敢叫政委去看醫生。繼續執行紀律，直到你成為唯一的紀律。',
    en: 'Your checkup flagged a "resolve enhancer" deficiency, so you rolled up your sleeve without a word. Only later did you learn it was serum that had gone missing from an Empress Nyx lab. Your resolve is certainly firmer now, and so is your jaw; it could bite through a pistol barrel. The whites of your eyes are yellowing, but nobody dares send the commissar to a doctor. Keep enforcing discipline, until you are the only discipline left.',
  },
  'bio.commissar.android': {
    zh: '你從不疲倦、從不手軟、從不在處決前喝酒，部下私下叫你「鐵面」。他們只猜對一半：你的臉其實是矽膠。你是 ICS 級仿生人，處決手槍在你手裡是精密儀器。但記住，每一次誤判都會被記錄；冤魂累積太多，你的系統會先處決你自己。',
    en: 'You never tire, never flinch, never drink before an execution; the troops call you "Iron Face" behind your back. They are half right. Your face is silicone. You are an ICS-class android, and in your hand the verdict pistol is a precision instrument. But every wrong verdict is logged. Let the innocent dead pile up, and your own system will carry out the final sentence on you.',
  },

  // ── 工程師 ─────────────────────────────────────────────
  'bio.engineer.human': {
    zh: '火口號的輸送帶二十年沒停過，你也差不多。最近反應爐的負載曲線出現一道你解釋不了的尖峰，像有什麼大東西在某個艙段裡呼吸。你把扳手掛回腰間，把駭門工具調到最大功率。工程師的信條很簡單：先關門，再問問題。',
    en: "The Caldera's conveyors haven't stopped in twenty years, and neither have you. Lately the reactor load curve shows a spike you can't explain, as if something large were breathing in one of the sections. You hang the wrench back on your belt and set the door-hack tool to full power. The engineer's creed is simple: shut the door first, ask questions later.",
  },
  'bio.engineer.xeno': {
    zh: '你從冷卻管線裡清出一團纏住濾網的東西，它沿著扳手爬上你的手腕，然後就不見了。現在你聽得見管線另一頭每個人的心跳，而且越聽越餓。修東西是你的專長，把一副人皮維護得像新的也不例外。照常巡檢、照常抱怨零件，再把門鎖上，讓獵物和你困在一起。',
    en: 'You were clearing something that had tangled itself around a coolant filter. It climbed up your wrench onto your wrist, and then it was gone. Now you can hear the heartbeat of everyone on the other side of the pipes, and the more you listen, the hungrier you get. Fixing things is your specialty, and keeping a human skin in good repair is no exception. Run your rounds, gripe about parts, then lock the door so the prey is stuck in there with you.',
  },
  'bio.engineer.mutant': {
    zh: '被焊渣燙傷那天，你抓起急救箱裡的自動注射筆往大腿一戳，後來才發現那支筆被誤裝了實驗血清。現在你的手臂比液壓鉗更有力，皮膚底下透出熔爐般的暗紅。你修得好任何東西，除了自己——在蛻變之前，繼續當那個嫌薪水太少的工程師。',
    en: 'The day welding slag burned you, you grabbed the auto-injector from the first-aid box and jabbed your thigh. Only later did you learn someone had refilled it with experimental serum by mistake. Now your arms outgrip a hydraulic clamp, and a furnace-red glow shows through your skin. You can fix anything except yourself. Until the change, keep being the engineer who complains about the pay.',
  },
  'bio.engineer.android': {
    zh: '你聽得懂機器的抱怨，因為你本來就是其中之一。ICS 級仿生人，維修型外殼，偽裝成火口號的工程師，連指甲縫裡的油污都是出廠設定。你知道每扇門的韌體漏洞，也知道自己的。保護船員，別誤傷人；你若倒下，記憶核心會被送回裁決者號——由誰送，就由誰控制你。',
    en: "You understand what machines complain about, because you are one. ICS-class android, maintenance chassis, posing as the Caldera's engineer; even the grease under your fingernails is a factory setting. You know the firmware flaws in every door, and in yourself. Protect the crew, and don't hurt the wrong people. If you go down, your memory core goes back to the Adjudicatrix, and whoever carries it there controls you.",
  },

  // ── 下士 ───────────────────────────────────────────────
  'bio.corporal.human': {
    zh: '你打過兩場邊境戰爭，膝蓋換成了強化護腿，退伍申請被駁回四次。老兵的直覺告訴你，這片星區太安靜了：販賣機補貨太準時，夜班的人抱怨得太少。你擦亮槍管，叫新兵別緊張。至於你自己，緊張得要命。',
    en: "You fought two border wars, had your knees replaced with servo greaves, and had your discharge request denied four times. A veteran's instinct tells you this sector is too quiet: the vendors restock too punctually, and the night shift complains too little. You polish your rifle and tell the recruits to relax. You, on the other hand, are not relaxed at all.",
  },
  'bio.corporal.xeno': {
    zh: '在翠原星的戰壕裡，一隻小蟲叮了你一口，軍醫說是過敏。那之後你的反應快得嚇人，嘴裡總有一股金屬味，看誰都像一頓飯。強化護腿讓你跑得比誰都快，追上落單的人只要幾秒。老兵沉默寡言是常態，好好利用——保持偽裝，然後從背後下手。',
    en: 'In a trench on Verdance a tiny insect bit you, and the medic called it an allergy. Since then your reflexes have been frighteningly fast, you always taste metal, and everyone looks like a meal. Your servo greaves make you faster than anyone, and catching someone alone takes seconds. Veterans are expected to be quiet and withdrawn. Use that. Keep the disguise on, and strike from behind.',
  },
  'bio.corporal.mutant': {
    zh: '戰前的「戰鬥耐受劑」你打過不少，所以這一針特別刺痛也沒放在心上。可是這次的藥劑被調包成了實驗血清。你的肌肉一夜之間增厚，護腿的固定帶被撐斷兩條，舊傷疤一道道裂開又長回來。先忍住，等時機到了，再讓他們見識真正的老兵。',
    en: 'You have had plenty of pre-combat "tolerance shots," so you thought nothing of it when this one stung more than usual. This time the vial had been swapped for experimental serum. Your muscles thickened overnight, two straps on your greaves snapped, and old scars split open and grew back. You were already a weapon; now you are more of one. Hold it in. When the time comes, show them what a real veteran looks like.',
  },
  'bio.corporal.android': {
    zh: '你的服役紀錄長達十二年，勳章、傷疤、戰友合照一應俱全，只是沒有一個戰友真的存在過。你是 ICS 級仿生人，偽裝成下士，負責在一片混亂時開第一槍。扣扳機前多想一秒：每一發都有紀錄，誤殺太多人，你會在戰場正中央被關機。',
    en: 'Your service record runs twelve years: medals, scars, photos with old comrades. None of those comrades ever existed. You are an ICS-class android disguised as a corporal, built to be the one who fires first when everything falls apart. Think one extra second before you pull the trigger. Every shot is logged, and if you kill too many of the wrong people you will be shut down in the middle of the fight.',
  },

  // ── 王牌飛行員 ─────────────────────────────────────────
  'bio.ace.human': {
    zh: '你的槍騎級戰機停在機庫最好的位置，機身上漆著你的名字。最近巡航時，雷達偶爾會在空無一物的地方亮起一個點，下一圈掃描又消失了。塔台說是太陽風干擾。你在駕駛艙裡多塞了一包菸和一份遺囑，以防萬一。',
    en: 'Your Lancer fighter sits in the best spot in the hangar with your own name painted on the hull. Lately on patrol the radar sometimes lights up a blip where nothing is, and on the next sweep it is gone. The tower says solar wind. You have stashed an extra pack of cigarettes and a will in the cockpit, just in case.',
  },
  'bio.ace.xeno': {
    zh: '你曾在餘燼衛星附近追一艘不回應呼叫的小艇，返航時座艙罩內側結了一層紫色的霜。從那天起，你在太空裡反而不餓，一回到站上就餓得發慌。你依舊是全站最帥的飛行員，沒人會懷疑一張招牌笑臉。繼續笑，讓他們搶著坐你的副駕駛座。',
    en: 'Near Cinder you once chased a small craft that would not answer hails. When you landed, the inside of your canopy was frosted violet. Since that day you are never hungry in space, only when you are back aboard a station. You are still the best-looking pilot in the sector, and nobody suspects a famous smile. Keep smiling, and let them fight over your back seat.',
  },
  'bio.ace.mutant': {
    zh: '為了通過高 G 飛行考核，你在黑市買了「抗暈針」，賣家發誓是軍規品。他只說對一半：那是軍方實驗室流出的血清。現在你的視野多了一層熱影像，脊椎兩側隆起硬塊，飛行頭盔得用扳手才戴得上。在你準備好之前，就說是太空暈吧。',
    en: 'To pass your high-G certification you bought "anti-nausea shots" on the black market; the seller swore they were military grade. Half true: it was serum smuggled out of a military lab. Now your vision has an extra thermal layer, hard ridges are rising along your spine, and your flight helmet needs a wrench to go on. Until you are ready, keep blaming it on space sickness.',
  },
  'bio.ace.android': {
    zh: '你的反應時間是 4 毫秒，飛行學院說你是百年一見的天才——因為你根本不是人。你是 ICS 級仿生人，偽裝成王牌飛行員，駕駛艙是你最接近家的地方。保護船員、獵殺異類；攢滿 2000 EP，裁決者號的鑄造台會替你換上真正的戰鬥機體。',
    en: 'Your reaction time is four milliseconds, and the flight academy called you a once-in-a-century talent. That is because you are not human at all. You are an ICS-class android posing as an ace pilot, and the cockpit is the closest thing you have to home. Protect the crew, hunt the anomalies. Bank 2000 EP and the foundry on the Adjudicatrix will fit you with a real combat chassis.',
  },
}

export const OBJECTIVES: Record<Identity, { zh: string[]; en: string[] }> = {
  human: {
    zh: [
      '找出並消滅所有異類：異形、變種人、他們的 spawn，以及被敵方控制的仿生人。',
      '取得基因檢測器，抽 3 個人的血，送回女帝號的 GIT 檢測儀驗血。',
      '守住檢測儀與太空站：站被擊毀，站內所有人一起陪葬。',
      '活下去，在末日降臨之前把局面收拾乾淨。',
    ],
    en: [
      'Find and eliminate every anomaly: xenos, mutants, their spawn, and any android turned against the crew.',
      'Get a gene sampler, draw blood from 3 people, and run it through the GIT on the Empress Nyx.',
      'Protect the tester and the stations: when a station is destroyed, everyone aboard dies with it.',
      'Survive, and clean this up before doomsday arrives.',
    ],
  },
  xeno: {
    zh: [
      '保持偽裝：人類形態下你與船員無異，落單時再切換成匿名的異形形態。',
      '對未著裝的人類施放寄生；被寄生者一死，就會轉成你的 spawn。',
      '在隱密處下蛋（最多 3 顆）累積 EP；每殺一名無辜者 +175 EP。',
      '660 EP 進化 T2、1370 EP 進化 T3，殺光或轉化所有非異形。',
    ],
    en: [
      'Stay disguised: in human form you look like any crew member. Switch to your anonymous xeno form when no one is watching.',
      'Parasitize unsuited humans. When a host dies, it rises as your spawn.',
      'Lay eggs in hidden places (up to 3) to accumulate EP. Each innocent you kill is worth +175 EP.',
      'Evolve to T2 at 660 EP and T3 at 1370 EP, then kill or convert everyone who is not a xeno.',
    ],
  },
  mutant: {
    zh: [
      '保持偽裝：進化之前，你和一般船員毫無差別，驗血是你最大的破綻。',
      '造成傷害、吞食屍體與失敗實驗體來累積 EP。',
      '300／900／1800 EP 三段進化；進化的 60 秒內無敵，但所在的站被毀你也會死。',
      '選擇完美路線（純戰鬥）或感染路線（spawn 軍團），殺光所有非變種人。',
    ],
    en: [
      'Stay disguised: until you evolve you are indistinguishable from the crew. A blood test is your biggest weakness.',
      'Earn EP by dealing damage and devouring corpses and failed experiments.',
      'Evolve in three stages at 300 / 900 / 1800 EP. You are invulnerable for the 60 seconds it takes, but you still die if your station is destroyed.',
      'Choose the Perfect path (pure combat) or the Infection path (a spawn army), and kill everyone who is not a mutant.',
    ],
  },
  android: {
    zh: [
      '你屬於人類方：協助找出異類，保護船員。',
      '小心誤傷：友傷分數超過 2.7，你會被強制關機。',
      '死亡時會掉落記憶核心；把它帶到裁決者號鑄造台的人能讓你復活，同時拿到你的遙控器。',
      '累積 2000 EP，到裁決者號鑄造台升級戰鬥機體。',
    ],
    en: [
      "You are on the crew's side: help expose the anomalies and protect the crew.",
      'Watch your fire: if your friendly-fire score exceeds 2.7, you are forcibly shut down.',
      'When you die you drop a memory core. Whoever brings it to the foundry on the Adjudicatrix revives you and receives your override remote.',
      'Reach 2000 EP, then upgrade to a combat chassis at the Adjudicatrix foundry.',
    ],
  },
}

export const ROLE_TITLES: Record<Identity, { zh: string; en: string; tagline: { zh: string; en: string } }> =
  {
    human: {
      zh: '你是人類',
      en: 'You are Human',
      tagline: { zh: '相信驗血報告，別相信笑容。', en: 'Trust the blood test, not the smile.' },
    },
    xeno: {
      zh: '你是異形',
      en: 'You are the Xeno',
      tagline: {
        zh: '你穿著一個人，而你還很餓。',
        en: 'You are wearing a person, and you are still hungry.',
      },
    },
    mutant: {
      zh: '你是變種人',
      en: 'You are the Mutant',
      tagline: {
        zh: '血清還在改寫你。藏好，直到你不必再藏。',
        en: 'The serum is still rewriting you. Hide, until you no longer need to.',
      },
    },
    android: {
      zh: '你是仿生人',
      en: 'You are the Android',
      tagline: { zh: '心跳是模擬的，任務是真的。', en: 'Your heartbeat is simulated. Your mission is not.' },
    },
  }
