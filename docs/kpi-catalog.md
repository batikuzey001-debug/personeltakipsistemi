# KPI Kataloğu (V1)

## Genel Notlar
- **direction**: 
  - `higher_is_better`
  - `lower_is_better`
- **target**: hedef değer (varsayılan; team/employee override edebilir)
- **weight**: overall hesapta ağırlık (varsayılan; team/employee override edebilir)
- **source**: hangi kaynaktan gelir (`telegram`, `manual`, `mixed`)
- **visible**: default görünürlük (kartta gösterilsin mi?)

---

## Telegram-türev KPI’lar

### 1) KPI_FIRST_SEC
- Ad: İlk Yanıt Süresi
- Kod: `KPI_FIRST_SEC`
- direction: `lower_is_better`
- target: 120 (saniye) → yani 2 dk
- weight: 0.4
- unit: saniye
- source: telegram
- visible: true

### 2) KPI_CLOSE_SEC
- Ad: Kapanış Süresi
- Kod: `KPI_CLOSE_SEC`
- direction: `lower_is_better`
- target: 600 (saniye) → yani 10 dk
- weight: 0.3
- unit: saniye
- source: telegram
- visible: true

### 3) KPI_KT_COUNT
- Ad: Günlük KT Sayısı
- Kod: `KPI_KT_COUNT`
- direction: `higher_is_better`
- target: 10 (günlük)
- weight: 0.2
- unit: adet
- source: telegram
- visible: true

### 4) KPI_FIN_REJECT_RATE
- Ad: Finans Red Oranı
- Kod: `KPI_FIN_REJECT_RATE`
- direction: `lower_is_better`
- target: 0.05 (yani %5)
- weight: 0.1
- unit: oran (0–1)
- source: telegram
- visible: true

---

## Manuel Rapor KPI’lar (Manager doldurur)

### 5) KPI_QUALITY_SCORE
- Ad: Kalite Puanı
- Kod: `KPI_QUALITY_SCORE`
- direction: `higher_is_better`
- target: 85 (0–100 arası puan)
- weight: 0.3
- unit: puan
- source: manual
- visible: true

### 6) KPI_EXCEPTION_COUNT
- Ad: SLA İstisna Sayısı
- Kod: `KPI_EXCEPTION_COUNT`
- direction: `lower_is_better`
- target: 0
- weight: 0.1
- unit: adet
- source: manual
- visible: true

---

## Özet
- Telegram’dan otomatik: İlk Yanıt, Kapanış, KT Sayısı, Finans Red Oranı
- Manager raporlarından: Kalite Puanı, İstisna Sayısı
- Varsayılan hedef/ağırlıklar buradan gelir; **team** ve **employee override** tablosu ile özelleştirilebilir.
