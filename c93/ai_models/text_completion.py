import re
from collections import defaultdict
import json
import os


class AncientTextCompleter:
    def __init__(self):
        self.corpus = self._load_corpus()
        self.ngram_models = self._build_ngram_models()
        self.classic_phrases = self._load_classic_phrases()
    
    def _load_corpus(self):
        corpus = [
            "天地玄黄宇宙洪荒",
            "日月盈昃辰宿列张",
            "寒来暑往秋收冬藏",
            "闰余成岁律吕调阳",
            "云腾致雨露结为霜",
            "金生丽水玉出昆冈",
            "剑号巨阙珠称夜光",
            "果珍李柰菜重芥姜",
            "海咸河淡鳞潜羽翔",
            "龙师火帝鸟官人皇",
            "始制文字乃服衣裳",
            "推位让国有虞陶唐",
            "吊民伐罪周发殷汤",
            "坐朝问道垂拱平章",
            "爱育黎首臣伏戎羌",
            "遐迩壹体率宾归王",
            "鸣凤在竹白驹食场",
            "化被草木赖及万方",
            "盖此身发四大五常",
            "恭惟鞠养岂敢毁伤",
            "女慕贞洁男效才良",
            "知过必改得能莫忘",
            "罔谈彼短靡恃己长",
            "信使可覆器欲难量",
            "墨悲丝染诗赞羔羊",
            "景行维贤克念作圣",
            "德建名立形端表正",
            "空谷传声虚堂习听",
            "祸因恶积福缘善庆",
            "尺璧非宝寸阴是竞",
            "资父事君曰严与敬",
            "孝当竭力忠则尽命",
            "临深履薄夙兴温凊",
            "似兰斯馨如松之盛",
            "川流不息渊澄取映",
            "容止若思言辞安定",
            "笃初诚美慎终宜令",
            "荣业所基籍甚无竟",
            "学而时习之不亦说乎",
            "有朋自远方来不亦乐乎",
            "人不知而不愠不亦君子乎",
            "温故而知新可以为师矣",
            "学而不思则罔思而不学则殆",
            "知之为知之不知为不知是知也",
            "三人行必有我师焉",
            "择其善者而从之其不善者而改之",
            "见贤思齐焉见不贤而内自省也",
            "己所不欲勿施于人",
            "三军可夺帅也匹夫不可夺志也",
            "道可道非常道名可名非常名",
            "无名天地之始有名万物之母",
            "故常无欲以观其妙常有欲以观其徼",
            "天地不仁以万物为刍狗",
            "圣人不仁以百姓为刍狗",
            "上善若水水善利万物而不争",
            "知人者智自知者明",
            "胜人者有力自胜者强",
            "知足者富强行者有志",
            "大学之道在明明德在亲民在止于至善",
            "知止而后有定定而后能静",
            "静而后能安安而后能虑",
            "物有本末事有终始知所先后则近道矣",
            "古之欲明明德于天下者先治其国",
            "欲治其国者先齐其家",
            "欲齐其家者先修其身",
            "欲修其身者先正其心",
            "欲正其心者先诚其意",
            "欲诚其意者先致其知",
            "致知在格物物格而后知至",
            "知至而后意诚意诚而后心正",
            "关关雎鸠在河之洲",
            "窈窕淑女君子好逑",
            "蒹葭苍苍白露为霜",
            "所谓伊人在水一方",
            "桃之夭夭灼灼其华",
            "之子于归宜其室家",
            "青青子衿悠悠我心",
            "一日不见如三月兮",
            "昔我往矣杨柳依依",
            "今我来思雨雪霏霏",
            "床前明月光疑是地上霜",
            "举头望明月低头思故乡",
            "白日依山尽黄河入海流",
            "欲穷千里目更上一层楼",
            "春眠不觉晓处处闻啼鸟",
            "夜来风雨声花落知多少",
            "锄禾日当午汗滴禾下土",
            "谁知盘中餐粒粒皆辛苦",
            "日照香炉生紫烟遥看瀑布挂前川",
            "飞流直下三千尺疑是银河落九天",
            "两个黄鹂鸣翠柳一行白鹭上青天",
            "窗含西岭千秋雪门泊东吴万里船",
            "千里莺啼绿映红水村山郭酒旗风",
            "南朝四百八十寺多少楼台烟雨中",
            "人之初性本善性相近习相远",
            "苟不教性乃迁教之道贵以专",
            "昔孟母择邻处子不学断机杼",
            "养不教父之过教不严师之惰",
            "子不学非所宜幼不学老何为",
            "玉不琢不成器人不学不知义",
            "为人子方少时亲师友习礼仪",
            "香九龄能温席孝于亲所当执",
            "融四岁能让梨弟于长宜先知",
            "首孝悌次见闻知某数识某文",
            "一而十十而百百而千千而万",
            "三才者天地人三光者日月星",
            "三纲者君臣义父子亲夫妇顺",
            "曰春夏曰秋冬此四时运不穷",
            "曰南北曰西东此四方应乎中",
            "曰水火木金土此五行本乎数",
            "曰仁义礼智信此五常不容紊",
            "地所生有草木此植物遍水陆",
            "有虫鱼有鸟兽此动物能飞走",
            "稻粱菽麦黍稷此六谷人所食",
            "马牛羊鸡犬豕此六畜人所饲",
            "曰喜怒曰哀惧爱恶欲七情具",
            "匏土革木石金与丝竹乃八音",
            "高曾祖父而身身而子子而孙",
            "自子孙至玄曾乃九族人之伦",
            "父子恩夫妇从兄则友弟则恭",
            "长幼序友与朋君则敬臣则忠",
            "此十义人所同当师叙勿违背",
            "斩齐衰大小功至缌麻五服终",
            "礼乐射御书数古六艺今不具",
            "惟书学人共遵既识字讲说文",
            "有古文大小篆隶草继不可乱",
            "若广学惧其繁但略说能知原",
            "凡训蒙须讲究详训诂明句读",
            "为学者必有初小学终至四书",
            "论语者二十篇群弟子记善言",
            "孟子者七篇止讲道德说仁义",
            "作中庸子思笔中不偏庸不易",
            "作大学乃曾子自修齐至平治",
            "孝经通四书熟如六经始可读",
            "诗书易礼春秋号六经当讲求",
            "有连山有归藏有周易三易详",
            "有典谟有训诰有誓命书之奥",
            "我周公作周礼著六官存治体",
            "大小戴注礼记述圣言礼法备",
            "曰国风曰雅颂号四诗当讽咏",
            "诗既亡春秋作寓褒贬别善恶",
            "三传者有公羊有左氏有谷梁",
            "经既明方读子撮其要记其事",
            "五子者有荀扬文中子及老庄",
            "经子通读诸史考世系知终始",
            "自羲农至黄帝号三皇居上世",
            "唐有虞号二帝相揖逊称盛世",
            "夏有禹商有汤周文武称三王",
            "夏传子家天下四百载迁夏社",
            "汤伐夏国号商六百载至纣亡",
            "周武王始诛纣八百载最长久",
            "周辙东王纲坠逞干戈尚游说",
            "始春秋终战国五霸强七雄出",
            "嬴秦氏始兼并传二世楚汉争",
            "高祖兴汉业建至孝平王莽篡",
            "光武兴为东汉四百年终于献",
            "魏蜀吴争汉鼎号三国迄两晋",
            "宋齐继梁陈承为南朝都金陵",
            "北元魏分东西宇文周与高齐",
            "迨至隋一土宇不再传失统绪",
            "唐高祖起义师除隋乱创国基",
            "二十传三百载梁灭之国乃改",
            "梁唐晋及汉周称五代皆有由",
            "炎宋兴受周禅十八传南北混",
            "辽与金帝号纷迨灭辽宋犹存",
            "至元兴金绪歇有宋世一同灭",
            "并中国兼戎狄九十年国祚废",
            "明太祖久亲师传建文方四祀",
            "迁北京永乐嗣迨崇祯煤山逝",
            "廿二史全在兹载治乱知兴衰",
            "读史者考实录通古今若亲目",
            "口而诵心而惟朝于斯夕于斯",
            "昔仲尼师项橐古圣贤尚勤学",
            "赵中令读鲁论彼既仕学且勤",
            "披蒲编削竹简彼无书且知勉",
            "头悬梁锥刺股彼不教自勤苦",
            "如囊萤如映雪家虽贫学不辍",
            "如负薪如挂角身虽劳犹苦卓",
            "苏老泉二十七始发愤读书籍",
            "彼既老犹悔迟尔小生宜早思",
            "若梁灏八十二对大廷魁多士",
            "彼既成众称异尔小生宜立志",
            "莹八岁能咏诗泌七岁能赋棋",
            "彼颖悟人称奇尔幼学当效之",
            "蔡文姬能辩琴谢道韫能咏吟",
            "彼女子且聪敏尔男子当自警",
            "唐刘晏方七岁举神童作正字",
            "彼虽幼身已仕尔幼学勉而致",
            "有为者亦若是犬守夜鸡司晨",
            "苟不学曷为人蚕吐丝蜂酿蜜",
            "人不学不如物幼而学壮而行",
            "上致君下泽民扬名声显父母",
            "光于前裕于后人遗子金满嬴",
            "我教子惟一经勤有功戏无益",
            "戒之哉宜勉力"
        ]
        return corpus
    
    def _load_classic_phrases(self):
        return {
            "天地": ["玄黄", "宇宙"],
            "宇宙": ["洪荒"],
            "日月": ["盈昃"],
            "辰宿": ["列张"],
            "寒来": ["暑往"],
            "秋收": ["冬藏"],
            "云腾": ["致雨"],
            "露结": ["为霜"],
            "金生": ["丽水"],
            "玉出": ["昆冈"],
            "学而": ["时习之"],
            "不亦": ["说乎", "乐乎", "君子乎"],
            "温故": ["而知新"],
            "可以": ["为师矣"],
            "知之": ["为知之"],
            "不知": ["为不知"],
            "是知": ["也"],
            "三人": ["行必有我师焉"],
            "见贤": ["思齐焉"],
            "见不贤": ["而内自省也"],
            "己所": ["不欲"],
            "勿施": ["于人"],
            "三军": ["可夺帅也"],
            "匹夫": ["不可夺志也"],
            "道可": ["道非常道"],
            "上善": ["若水"],
            "水善": ["利万物而不争"],
            "知人": ["者智"],
            "自知": ["者明"],
            "胜人": ["者有力"],
            "自胜": ["者强"],
            "知足": ["者富"],
            "大学": ["之道"],
            "在明": ["明德"],
            "在亲": ["民"],
            "止于": ["至善"],
            "知止": ["而后有定"],
            "物有": ["本末"],
            "事有": ["终始"],
            "关关": ["雎鸠"],
            "在河": ["之洲"],
            "窈窕": ["淑女"],
            "君子": ["好逑"],
            "蒹葭": ["苍苍"],
            "白露": ["为霜"],
            "所谓": ["伊人"],
            "在水": ["一方"],
            "举头": ["望明月"],
            "低头": ["思故乡"],
            "白日": ["依山尽"],
            "黄河": ["入海流"],
            "欲穷": ["千里目"],
            "更上": ["一层楼"],
            "春眠": ["不觉晓"],
            "处处": ["闻啼鸟"],
            "夜来": ["风雨声"],
            "花落": ["知多少"],
            "锄禾": ["日当午"],
            "汗滴": ["禾下土"],
            "谁知": ["盘中餐"],
            "粒粒": ["皆辛苦"],
            "飞流": ["直下三千尺"],
            "疑是": ["银河落九天"],
            "人之初": ["性本善"],
            "性本善": ["性相近"],
            "性相近": ["习相远"],
            "苟不教": ["性乃迁"],
            "教之道": ["贵以专"],
            "昔孟母": ["择邻处"],
            "子不学": ["断机杼"],
            "养不教": ["父之过"],
            "教不严": ["师之惰"],
            "玉不琢": ["不成器"],
            "人不学": ["不知义"]
        }
    
    def _build_ngram_models(self):
        models = {
            'bigram': defaultdict(lambda: defaultdict(int)),
            'trigram': defaultdict(lambda: defaultdict(int))
        }
        
        for text in self.corpus:
            text = re.sub(r'[^\u4e00-\u9fa5]', '', text)
            
            for i in range(len(text) - 1):
                models['bigram'][text[i]][text[i + 1]] += 1
            
            for i in range(len(text) - 2):
                models['trigram'][text[i:i+2]][text[i + 2]] += 1
        
        return models
    
    def complete_text(self, text, cursor_position=None, max_candidates=5):
        text = re.sub(r'[^\u4e00-\u9fa5。，！？；：]', '', text)
        
        if not text:
            return []
        
        candidates = []
        
        if cursor_position is None:
            cursor_position = len(text)
        
        context = text[max(0, cursor_position - 5):cursor_position]
        
        if len(context) >= 2:
            last_two = context[-2:]
            if last_two in self.ngram_models['trigram']:
                next_chars = sorted(
                    self.ngram_models['trigram'][last_two].items(),
                    key=lambda x: -x[1]
                )[:max_candidates]
                for char, score in next_chars:
                    candidates.append({
                        'text': char,
                        'score': score,
                        'type': 'trigram',
                        'context': last_two
                    })
        
        if len(context) >= 1:
            last_one = context[-1]
            if last_one in self.ngram_models['bigram']:
                next_chars = sorted(
                    self.ngram_models['bigram'][last_one].items(),
                    key=lambda x: -x[1]
                )[:max_candidates]
                for char, score in next_chars:
                    if not any(c['text'] == char for c in candidates):
                        candidates.append({
                            'text': char,
                            'score': score,
                            'type': 'bigram',
                            'context': last_one
                        })
        
        for phrase, completions in self.classic_phrases.items():
            if context.endswith(phrase) or phrase.startswith(context[-len(phrase):] if len(phrase) <= len(context) else context):
                for completion in completions:
                    match_length = 0
                    for i in range(min(len(context), len(phrase))):
                        if context[-(i + 1):] == phrase[:i + 1]:
                            match_length = i + 1
                    
                    if match_length > 0:
                        completed = phrase[match_length:] + completion
                        if completed:
                            candidates.append({
                                'text': completed,
                                'score': 100 + match_length,
                                'type': 'classic',
                                'context': phrase
                            })
        
        candidates = sorted(candidates, key=lambda x: -x['score'])
        
        seen = set()
        unique_candidates = []
        for c in candidates:
            if c['text'] not in seen:
                seen.add(c['text'])
                unique_candidates.append(c)
                if len(unique_candidates) >= max_candidates:
                    break
        
        return unique_candidates
    
    def suggest_phrases(self, context, num_suggestions=3):
        suggestions = []
        
        for phrase, completions in self.classic_phrases.items():
            if phrase.startswith(context) or context in phrase:
                for completion in completions:
                    suggestions.append({
                        'original': phrase,
                        'completion': completion,
                        'full': phrase + completion
                    })
        
        return suggestions[:num_suggestions]
    
    def repair_missing_chars(self, text_with_holes, hole_char='□'):
        results = []
        parts = text_with_holes.split(hole_char)
        
        for i in range(len(parts) - 1):
            before = parts[i][-3:] if len(parts[i]) >= 3 else parts[i]
            after = parts[i + 1][:3] if len(parts[i + 1]) >= 3 else parts[i + 1]
            
            candidates = self.complete_text(before)
            
            if candidates:
                results.append({
                    'position': i,
                    'context_before': before,
                    'context_after': after,
                    'suggestions': candidates[:3]
                })
        
        return results
