# Erzeugt data/portions.json: übliche Portionen (Richtwerte, essbarer Anteil) für häufige BLV-Lebensmittel.
# Einheiten: piece Stück, slice Scheibe, tbsp EL, tsp TL, glass Glas, cup Tasse, handful Handvoll, portion Portion,
# pot Becher, can Dose, ball Kugel, scoop Kugel (Glace), clove Zehe, bar Tafel, bottle Flasche.
import json, sys
root = sys.argv[1]

G = {}
def add(ids, *units):
    for i in str(ids).split():
        G[i] = [list(u) for u in units]

P = lambda g: ('piece', g)
S = lambda g: ('slice', g)
EL = lambda g: ('tbsp', g)
TL = lambda g: ('tsp', g)
GL = lambda g: ('glass', g)
CUP = lambda g: ('cup', g)
HV = lambda g: ('handful', g)
PO = lambda g: ('portion', g)
POT = lambda g: ('pot', g)

# Obst (essbarer Anteil)
add(378, P(150)); add(381, P(120)); add(382, P(160)); add(405, P(150)); add(397, P(60)); add(395, P(70))
add(401, P(130)); add(379, P(40)); add('474 479', P(30)); add(385, P(15), PO(150)); add(478, HV(80), PO(125))
add(380, P(150)); add(377, S(80)); add(399, S(150)); add(402, S(250)); add('389 390', HV(50), PO(125))
add(394, P(8), HV(80)); add(388, P(250)); add(396, P(300)); add(386, P(50)); add(387, P(20)); add(384, P(8))
add(393, P(200)); add(469, P(8)); add(13882, P(150)); add('627 628', EL(20), PO(100))
# Gemüse
add(348, P(100)); add(354, P(400), PO(100)); add(355, P(80)); add('359 360', P(150)); add(368, P(80)); add(356, ('clove', 4))
add('813 1057', P(120)); add(14259, P(100)); add(14258, P(180)); add(367, P(250)); add('351 350', PO(150))
add('1005 1004', PO(150)); add(375, P(20)); add(448, PO(50)); add(459, PO(50)); add(365, HV(30)); add(353, PO(150))
add(1009, PO(150)); add('632 1033', PO(100)); add('1059', PO(150)); add('1060 13386', PO(150)); add('370 13385', PO(60))
add(13388, PO(150)); add(439, PO(60))
# Eier
add('290 1070', P(55)); add(410, P(18)); add(411, P(33))
# Brot & Gebäck
add('829 14077 833 14078 10446 831', S(40)); add(823, S(35)); add(830, S(45)); add(842, P(90)); add(822, P(50))
add('820 1460', S(40)); add('836 834 10406', P(45)); add(832, P(70)); add(835, P(60)); add('827 826 825 14109', S(25))
add('918 919 920', S(10)); add('930 929', P(10)); add(14298, P(8)); add(14278, P(10)); add(13446, P(70))
# Getreide, Beilagen
add(198, EL(10), PO(50)); add('940 14144', PO(30)); add('942 943 948', PO(50)); add(938, EL(10), PO(50))
add('427 419 428', PO(75)); add('1066 1065 1067', PO(200)); add('800 799 801', PO(100)); add('1063 1062 1064', PO(220))
add(13394, PO(75)); add(13396, PO(180)); add(14191, PO(180)); add(14197, PO(200)); add(422, PO(75))
add('1511 1512', PO(250)); add('1513 1514', PO(250))
# Milch & Milchprodukte
add('62 63 14126 59 61 13399 1194 529', GL(200)); add('14113 14131 13450 14133', GL(200))
add('52 587 53 54 55 56 57 99 1192 588 590', POT(180)); add(58, POT(150)); add('14204 14205', POT(150))
add('13451 13452 13453 13454 14170 14171 14172 14174', POT(150))
add('71 571 70', POT(250), EL(25)); add(13501, POT(125)); add(505, POT(200))
add('14297 51 60', TL(5), PO(10)); add(208, TL(5))
add('555 553 554 556 557', S(20)); add(532, S(35)); add(82, ('ball', 125)); add(482, EL(5)); add(563, S(20))
add('616 619 13392', PO(30)); add('539 549', PO(50)); add(485, EL(15)); add(574, EL(15))
add('65 66 67 68 1195', EL(15)); add(69, P(12))
# Fette, Saucen, Aufstriche, Süssungsmittel
add('591 600 1069 598 1068 596 412 13402 14108 13404', EL(10), TL(4))
add('771 772 1682', EL(15)); add(635, EL(15)); add(13464, TL(5)); add(751, EL(15)); add(703, TL(7), EL(15))
add('696 697', TL(8), EL(20)); add(472, TL(8), EL(20)); add('470 471', TL(4)); add(768, TL(4))
add(10536, TL(7)); add(14093, EL(20)); add(14055, EL(15), PO(50)); add(1199, EL(15)); add(667, PO(100))
# Nüsse, Samen
add('271 270 273 269 278 275 282 14092 14238 274 279', HV(25)); add('276 281 277', EL(10)); add(13457, EL(12))
# Fleisch, Wurst, Fisch, Tofu
add(22, P(150)); add(20, P(170)); add(13276, P(120)); add(26, P(120)); add(24, P(150))
add(1103, PO(150)); add(30, P(200)); add(639, P(180)); add('13258 13262', P(150))
add('6 14237 1105 7 11', PO(125)); add('13297 13317', PO(100)); add(13316, P(100)); add('41 8', P(180))
add('13284 13283', P(150)); add(1081, P(100)); add('1082 1589', P(50)); add('1085 1080', P(130)); add('14183 14089', P(120))
add('1091 1094', S(5)); add('194 210', P(125)); add(13354, P(110)); add(193, S(20)); add(418, ('can', 110))
add(756, P(150)); add(413, ('can', 90)); add('13437 14120 14119 14090', PO(100)); add('14167 14168', PO(100))
add('14150 14149', P(100))
# Süsses, Snacks
add('195 196 197 612 655 643 641', P(5), ('bar', 100)); add(13448, P(25)); add(951, P(3)); add(424, PO(30))
add('12982 12983', HV(30)); add(14008, P(20)); add(13960, P(70)); add(13959, P(75)); add('14206 694', ('scoop', 50))
add('681 932', HV(25)); add(14287, P(30)); add(14233, P(60)); add(14304, P(20))
# Getränke
add(994, CUP(150)); add(1189, CUP(25)); add(1190, CUP(40)); add(1121, CUP(180)); add('1187 1185 1186', CUP(200))
add(803, CUP(250)); add('576 568 562 573 564 566 13880 572', GL(200)); add('498 499', GL(200), ('can', 330))
add('816 13420', GL(300), ('bottle', 500)); add('1183', GL(300)); add('509 10477 508 510 511', GL(100))
add('10478 10479', GL(200)); add(1132, GL(200)); add('14220 14050', CUP(200)); add(983, TL(2)); add('978 581 960', TL(5))
# Fertiggerichte, Pizza, Sandwiches
add('1532 1533 1534 1535 1536 1537 1538 1539 1540', P(400)); add('1555 1556 1557 1558 1561 1562', P(180))
add(1590, P(150)); add('863 1518 1519', PO(200)); add('1517 1516', PO(150)); add(14255, PO(300)); add(1584, PO(300))

blv = json.load(open(root + '/data/blv.json', encoding='utf-8'))
names = {r[0]: r[1] for r in blv['rows']}
missing = [i for i in G if i not in names]
assert not missing, missing
out = {
    'source': 'Übliche Portionen (Richtwerte, essbarer Anteil) für häufige Lebensmittel der Schweizer Nährwertdatenbank; selbst zusammengestellt, gerundet.',
    'fields': ['unit', 'grams'],
    'rows': {i: G[i] for i in sorted(G, key=lambda k: names[k])},
}
open(root + '/data/portions.json', 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(len(G), 'Lebensmittel')
