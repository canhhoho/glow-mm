# Danh mục địa chỉ người nhận – VTP Myanmar OMS

- Trang: https://oms.vtpmyanmar.com.mm/create/single-order (phần "Người nhận")
- Ngày thu thập: 2026-10-27
- Nguồn dữ liệu: API của trang
  - Cấp 1: `GET https://oms-api.vtpglobal.com.vn/oms-core/api/v1/mdm/country/MM`
  - Cấp 2, 3: `GET https://oms-api.vtpglobal.com.vn/oms-core/api/v1/mdm/administrativedivision/{id}` (id của cấp cha)

## Cấu trúc

3 dropdown bắt buộc, chọn theo thứ tự cha → con:

1. Liên bang / Vùng (State/Region), 15 mục
2. Huyện (District), 74 mục, phụ thuộc Liên bang / Vùng
3. Thị trấn (Township), 329 mục, phụ thuộc Huyện

Định dạng trong file: `Tên (MÃ)`. Thứ tự giữ đúng thứ tự hiển thị trong dropdown.

## Tổng hợp theo Liên bang / Vùng

| Liên bang / Vùng | Mã | Số Huyện | Số Thị trấn |
| --- | --- | --- | --- |
| Sagaing | SGG | 9 | 37 |
| Magway | MGY | 5 | 25 |
| Kachin | KCN | 4 | 18 |
| Kayah | KYH | 2 | 7 |
| Chin | CHN | 3 | 8 |
| Tanintharyi | TNI | 3 | 10 |
| Bago | BGO | 4 | 28 |
| Shan | SHN | 14 | 55 |
| Kayin | KYN | 4 | 7 |
| Mandalay | MDY | 7 | 28 |
| Mon | MON | 2 | 10 |
| Rakhine | RKE | 5 | 17 |
| Yangon | YGN | 4 | 45 |
| Ayeyarwady | AYY | 6 | 26 |
| Nay Pyi Taw | NPW | 2 | 8 |

## Danh mục chi tiết

### Sagaing (SGG)
- Tamu (TMU): Tamu (TMU)
- Sagaing (SGG): Sagaing (SGG), Myaung (MAG), Myinmu (MMU)
- Shwebo (SBO): Shwebo (SBO), Khin-U (KNU), Wetlet (WLT), Kanbalu (KBL), Kyunhla (KYL), Ye-U (YEU), Taze (TZE), Tabayin (TBY)
- Monywa (MYA): Monywa (MWA), Budalin (BDL), Ayadaw (AYD), Chaung-U (CGU)
- Katha (KTA): Katha (KTA), Indaw (IDW), Banmauk (BMK), Wuntho (WTO), Pinlebu (PLB), Tigyaing (TYA), Kawlin (KLN)
- Kale (KLE): Kale (KLE), Kalewa (KLW), Mingin (MGN)
- Mawlaik (MLK): Mawlaik (MLK), Paungbyin (PBN)
- Hkamti (KTI): Hkamti (KTI), Lay Shi (LSI), Nanyun (NYN), Homalin (HML), Lahe (LHE)
- Yinmabin (YBN): Yinmabin (YMB), Salingyi (SLY), Pale (PLE), Kani (KNI)

### Magway (MGY)
- Magway (MGW): Magway (MGW), Yenangyaung (YNY), Chauk (CHK), Taungdwingyi (TDG), Myothit (MTT), Natmauk (NMK)
- Minbu (MBU): Minbu (MBU), Pwintbyu (PBU), Ngape (NPE), Salin (SLN), Sidoktaya (STY)
- Thayet (TYT): Thayet (TYT), Minhla (MIL), Mindon (MDN), Kamma (KMA), Aunglan (ALN), Sinbaungwe (SBW)
- Pakokku (PKK): Pakokku (PKU), Yesagyo (YSG), Myaing (MIG), Pauk (PAK), Seikphyu (SPU)
- Gangaw (GGW): Gangaw (GGW), Tilin (TLN), Saw (SAW)

### Kachin (KCN)
- Mohnyin (MHN): Mohnyin (MNY), Mogaung (MGG), Hpakant (PKT)
- Myitkyina (MKN): Myitkyina (MKN), Injangyang (IJG), Tanai (TAI), Chipwi (CPI), Waingmaw (WMW), Tsawlaw (TLW)
- Bhamo (BMO): Shwegu (SWG), Momauk (MMK), Mansi (MSI), Bhamo (BMO)
- Puta-O (PTO): Puta-O (PTO), Sumprabum (SPB), Machanbaw (MCB), Khaunglanhpu (KLP), Nawngmun (NMN)

### Kayah (KYH)
- Loikaw (LKW): Loikaw (LKW), Hpruso (PRS), Shadaw (SDW), Demoso (DMS)
- Bawlake (BLK): Bawlakhe (BLK), Hpasawng (PSG), Mese (MSE)

### Chin (CHN)
- Hakha (HKA): Hakha (HKA), Thantlang (TLG)
- Falam (FLM): Tedim (TDM), Tonzang (TZG)
- Mindat (MDT): Mindat (MDT), Kanpetlet (KPL), Paletwa (PWA), Matupi (MTP)

### Tanintharyi (TNI)
- Dawei (DWI): Dawei (DWI), Launglon (LLN), Thayetchaung (TYC), Yebyu (YBU)
- Myeik (MYK): Myeik (MYK), Kyunsu (KSU), Tanintharyi (TNI), Palaw (PLW)
- Kawthoung (KTO): Kawthoung (KTG), Bokpyin (BYN)

### Bago (BGO)
- Bago (BGO): Bago (BGO), Thanatpin (TNP), Kawa (KWA), Waw (WAW), Nyaunglebin (NLB), Kyauktaga (KGA), Daik-U (DKU), Shwegyin (SGN)
- Taungoo (TGO): Taungoo (TGO), Yedashe (YDS), Kyaukkyi (KKI), Phyu (PHU), Oktwin (OTN), Htantabin (TAB)
- Pyay (PYY): Pyay (PYY), Paukkhaung (PKG), Paungde (PDE), Shwedaung (SDA), Padaung (PDG), Thegon (TGN)
- Thayarwady (TWY): Thayarwady (TWD), Letpadan (LPD), Okpho (OPO), Zigon (ZGN), Nattalin (NTL), Gyobingauk (GBA), Minhla (MLA), Monyo (MYO)

### Shan (SHN)
- Kunlong (KLG): Kunlong (KLG)
- Matman (MMN): Matman (MMN), Pangsang (PSA), Narphan (NPN)
- Monghpyak (MGP): Monghpyak (MPK), Mongyawng (MYW)
- Taunggyi (TGG): Taunggyi (TGI), Nyaungshwe (NSE), Hopong (HPG), Hsihseng (HHG), Kalaw (KLA), Pindaya (PDY), Ywangan (YWG), Lawksawk (LSK), Pinlaung (PLG), Pekon (PKN)
- Loilen (LLN): Loilen (LLE), Laihka (LKA), Nansang (NSG), Kunhing (KHG), Kyethi (KTH), Mongkaing (MKG), Monghsu (MSU)
- Langkho (LKO): Langkho (LKO), Mongnai (MNI), Mawkmai (MMI), Mongpan (MPN)
- Lashio (LSH): Lashio (LSO), Hseni (SNI), Mongyai (MYI), Tangyan (TYN)
- Muse (MSE): Muse (MUS), Namhkan (NKN), Kutkai (KKA)
- Kyaukme (KKM): Kyaukme (KME), Nawnghkio (NKO), Hsipaw (SPW), Namtu (NTU), Namhsan (NSN), Mongmit (MMT), Mabein (MAB), Manton (MAT)
- Laukkaing (LKK): Laukkaing (LKG), Konkyan (KKN)
- Hopang (HPG): Hopang (HPA), Mongmao (MMO), Pangwaun (PWN)
- Kengtung (KTG): Kengtung (KTU), Mongkhet (MKT), Mongyang (MNG), Mongla (MGA)
- Monghsat (MGS): Monghsat (MST), Mongping (MPG), Mongton (MTO)
- Tachileik (TCL): Tachileik (TCL)

### Kayin (KYN)
- Hpa-An (PAN): Hpa-An (PAN), Hlaingbwe (LBE), Thandaunggyi (TDA)
- Hpapun (PUN): Hpapun (PUN)
- Myawaddy (MWD): Myawaddy (MWD)
- Kawkareik (KKR): Kyainseikgyi (KSK), Kawkareik (KKR)

### Mandalay (MDY)
- Mandalay (MDY): Aungmyaythazan (ATZ), Chanayethazan (CTZ), Mahaaungmyay (MAM), Chanmyathazi (CMT), Pyigyitagon (PGT), Amarapura (APR), Patheingyi (PTG)
- Pyinoolwin (POL): Pyinoolwin (POL), Madaya (MYA), Singu (SGU), Mogoke (MGE), Thabeikkyin (TBK)
- Kyaukse (KKS): Kyaukse (KSE), Sintgaing (SGA), Myittha (MYT), Tada-U (TDU)
- Myingyan (MGY): Myingyan (MYN), Taungtha (TTA), Natogyi (NTG), Kyaukpadaung (KPD), Ngazun (NZN)
- Nyaung-U (NYU): Nyaung-U (NYU)
- Yamethin (YMT): Yamethin (YMT), Pyawbwe (PBE)
- Meiktila (MTL): Meiktila (MTL), Thazi (TZI), Wundwin (WDW), Mahlaing (MLG)

### Mon (MON)
- Mawlamyine (MLM): Mawlamyine (MLY), Kyaikmaraw (KMR), Chaungzon (CZN), Thanbyuzayat (TZY), Mudon (MDO), Ye (YEE)
- Thaton (TTN): Thaton (TTN), Paung (PAG), Kyaikto (KTO), Bilin (BLN)

### Rakhine (RKE)
- Mrauk-U (MRU): Mrauk-U (MRU), Kyauktaw (KTW), Myebon (MBN), Minbya (MBA)
- Sittwe (STW): Sittwe (STE), Ponnagyun (PNY), Pauktaw (PTA), Rathedaung (RTD)
- Maungdaw (MDW): Maungdaw (MDW), Buthidaung (BTD)
- Kyaukpyu (KKP): Kyaukpyu (KPU), Munaung (MAU), Ramree (RRE), Ann (ANN)
- Thandwe (TWE): Thandwe (TDE), Toungup (TGP), Gwa (GWA)

### Yangon (YGN)
- Yangon (East) (EYG): Thingangyun (TYG), Yankin (YKN), South Okkalapa (SOK), North Okkalapa (NOK), Thaketa (TKT), Dawbon (DBN), Tamwe (TWE), Pazundaung (PZD), Botahtaung (BTT), Dagon Myothit (South) (SDG), Dagon Myothit (North) (NDG), Dagon Myothit (East) (EDG), Dagon Myothit (Seikkan) (DKS), Mingalartaungnyunt (MTN)
- Yangon (North) (NYG): Insein (ISN), Mingaladon (MGL), Hmawbi (MBI), Hlegu (LGU), Htantabin (TTB), Hlaingtharya (LTY), Taikkyi (TKI), Shwepyithar (SPT)
- Yangon (South) (SYG): Thanlyin (TLY), Kyauktan (KTN), Thongwa (TWA), Kayan (KYN), Twantay (TTY), Kawhmu (KMU), Kungyangon (KYG), Dala (DLA), Seikgyikanaungto (SNT), Cocokyun (CKN)
- Yangon (West) (WYG): Kyauktada (KTD), Pabedan (PBD), Lanmadaw (LMD), Latha (LTA), Ahlone (ALE), Kyeemyindaing (KMD), Sanchaung (SCG), Hlaing (HLG), Kamaryut (KMY), Mayangone (MYG), Dagon (DGN), Bahan (BHN), Seikkan (SKN)

### Ayeyarwady (AYY)
- Labutta (LBT): Mawlamyinegyun (MLM), Labutta (LBT)
- Hinthada (HTD): Kyangin (KGI), Zalun (ZLN), Myanaung (MYU), Lemyethna (LMT), Hinthada (HTD), Ingapu (IGP)
- Pathein (PTN): Kangyidaunt (KYD), Kyaunggon (KGN), Kyonpyaw (KPW), Ngapudaw (NPD), Pathein (PTN), Yegyi (YGI), Thabaung (TBG)
- Pyapon (PYP): Kyaiklat (KLT), Dedaye (DDE), Pyapon (PPN), Bogale (BGL)
- Maubin (MBN): Nyaungdon (NDN), Danubyu (DBU), Pantanaw (PTW), Maubin (MIN)
- Myaungmya (MMA): Myaungmya (MMA), Wakema (WKM), Einme (EME)

### Nay Pyi Taw (NPW)
- Nay Pyi Taw (North) (NNW): Tatkon (TKN), Zay Yar Thi Ri (ZYT), Oke Ta Ra Thi Ri (OTR), Poke Ba Thi Ri (PBT)
- Nay Pyi Taw (South) (SNW): Pyinmana (PMN), Lewe (LWE), Za Bu Thi Ri (ZBT), Det Khi Na Thi Ri (DKN)

## Ghi chú dữ liệu

- Mã không duy nhất toàn cục: cùng một mã có thể xuất hiện ở nhiều cấp/vùng (ví dụ `MYA` = Huyện Monywa và Thị trấn Madaya; `MGY` = vùng Magway và Huyện Myingyan; `HPG` = Huyện Hopang và Thị trấn Hopong). Khi tra cứu phải dùng kèm cấp cha.
- Mã Huyện và mã Thị trấn cùng tên có thể khác nhau (ví dụ Huyện Monywa = `MYA`, Thị trấn Monywa = `MWA`).
- Chin → Huyện Falam chỉ có Tedim và Tonzang, không có thị trấn Falam.
- Kayah → Huyện ghi "Bawlake", thị trấn ghi "Bawlakhe" (khác chính tả, cùng mã `BLK`).
- Thị trấn "Det Khi Na Thi Ri" trong hệ thống có dấu cách thừa ở cuối tên (`"Det Khi Na Thi Ri "`), cần trim khi so khớp.
