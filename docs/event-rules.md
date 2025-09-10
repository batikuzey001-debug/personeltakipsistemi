# Telegram → Events Sınıflandırma Rehberi (V1)

## 1) Kanal Etiketleri (source_channel)
- **bonus**: RB // BONUS CANLI, Şans Bonus, Call Bonus
- **finans**: RB // FİNANSAL İŞLEMLER
- **mesai**: RB // Giriş-Çıkış
- **other**: diğer tüm kanallar (şimdilik dışarıda tutulur)

> Kural: `raw_messages.channel_tag -> events.source_channel`

---

## 2) Korelasyon (ticket eşleştirme)
- **correlation_id = `${chat_id}:${origin_msg_id}`**
- `origin_msg_id` = zincirin ilk mesajı (reply olmayan)
- reply mesajları: `reply_to_message.message_id` → aynı corr_id
- **Tekillik**: her corr_id için en fazla 1 `origin`, 1 `reply_first`, 1 `reply_close`

---

## 3) Event Tipleri (type)
| type          | Ne zaman?                                 | Zorunlu alanlar                    |
|---------------|--------------------------------------------|------------------------------------|
| origin        | Reply olmayan ilk mesaj                    | chat_id, msg_id, ts                |
| reply_first   | İlk ilgi/başlama mesajı                    | ts, first_sec (hesaplanmış)        |
| reply_close   | Kapanış / sonuç bildirimi                  | ts, close_sec (hesaplanmış)        |
| approve       | Finans onay ifadesi                        | ts                                 |
| reject        | Finans red ifadesi + gerekçe varsa         | ts, red_reason?                    |
| note          | Not / ara mesaj                            | ts                                 |
| check_in      | Mesai giriş                                | date, plan_start?                  |
| check_out     | Mesai çıkış                                | date, plan_end?                    |

> `approve/reject` sadece `finans` kanalı için aktif (V1).

---

## 4) Metin Sınıflandırma Kuralları (özet)
### A) reply_first (bonus/finans)
- Desen: `k`, `kt`, `ktt(… )`, `bakıyorum`, `ilgileniyorum`, `kontrol ediyorum`
- Kurallar TR-normalize edilerek uygulanır (ı→i, ş→s, vs.).
- Örnek regex mantığı:
  - tek harf **k**: `(?:^|\s)k(?:\s|$)`
  - kt: `\bk\s*t+\b` veya `\bkt+\b`
  - kelime: `\bbak(i|ı)yorum\b`, `\bilgileniyorum\b`, `\bkontrol(\s+ediyorum)?\b`

### B) reply_close (bonus/finans)
- İlk yanıt (**reply_first**) geldikten sonra aynı corr_id’de **sonraki** reply, aksi bir sinyal yoksa `reply_close`.
- Süre: `close_sec = max(0, ts(close) - ts(first or origin))`

### C) finans approve/reject
- **approve**: `onay`, `onaylandı`, `tamam`, `ok`, ✅, 👍
- **reject**: `red`, `iptal`, `olumsuz`, `hata`, ❌, 🚫
- **red_reason**: “red … {gerekçe}” kalıbından serbest metin.

### D) mesai (check_in / check_out)
- Kanal: **mesai**
- Satır formatı parse edilir (tarih + kişi + “Giriş/Çıkış” + saat)
- Vardiya düzeltme kuralı (00:00 sarkmaları) uygulanır.

---

## 5) Event Alan Sözlüğü
**Ortak:**
- `id` (pk), `source_channel`, `type`, `chat_id`, `msg_id`, `correlation_id`, `ts`
- `from_user_id`, `from_username`, `employee_id?` (lookup)
- `payload_json` (schemaless ek alanlar), `inserted_at`

**Özel alanlar (payload_json):**
- origin: `{ talep_text }`
- reply_first: `{ first_sec, first_by_full?, first_by_user? }`
- reply_close: `{ close_sec, closed_by_full?, closed_by_user?, close_text? }`
- approve: `{ }`
- reject: `{ red_reason? }`
- mesai: `{ name, islem: 'Giriş'|'Çıkış', plan_start?, plan_end?, raw }`
- finans extract (ops.): `{ method?, amount?, username? }`

---

## 6) Eşleştirme (employee lookup) Sırası
1. `from_user_id` → `employees.telegram_user_id`
2. `from_username` → `employees.telegram_username` (başındaki `@` temizlenir)
3. Yoksa **pending mapping** kuyruğuna düşer (manuel eşleştirme listesi)

---

## 7) Dedup & İdempotent Davranış
- `(chat_id, msg_id)` **unique**
- `correlation_id` + `type` (first/close) **unique**
- Aynı event tekrar gelirse **no-op** (güncelleme yok, 200 OK)

---

## 8) Validasyon & Reddetme
- Zorunlu: `chat_id`, `msg_id`, `ts`, `type`, `source_channel`
- `ts` ISO 8601 + TZ (Europe/Istanbul’a normalize edilir)
- Hatalı satırlar `rejected_events` listesine sebep ile yazılır (log).

---

## 9) Facts/Türev (özet)
- `reply_first` → KPI_FIRST_SEC (lower_is_better)
- `reply_close` → KPI_CLOSE_SEC (lower_is_better)
- `origin` veya `reply_first` sayısı → KPI_KT_COUNT (higher_is_better)
- finans `reject/approve` → KPI_FIN_REJECT_RATE, KPI_FIN_CLOSE_SEC, KPI_FIN_TOTAL_AMOUNT (ops.)
- mesai → attendance/discipline metrikleri (ops.)

---

## 10) Test Senaryoları (örnek)
1) **Tek zincir**: origin → first → close → beklenen: 3 event, süreler doğru
2) **Çoklu reply**: origin → first → note → note → close → beklenen: first/close birer kez
3) **Finans red**: origin → first → reply("red — IBAN yanlış") → beklenen: reject + close (aynı ts)
4) **Yetim origin**: 30 dk içinde first yok → “unanswered” raporuna girer (facts tarafında)
5) **Mesai gece**: 00:00 sarkan giriş/çıkış vardiya kuralıyla düzelir
