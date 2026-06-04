# Coddy Sync Worker

CoddyCheck ↔ CoddyResult o'rtasidagi **yupqa sync ko'prik**. Ikkala ilovaning ham mavjud
logikasiga tegmaydi — bu butunlay alohida, env orqali sozlanadigan worker.

## Nima qiladi

**1. Pull (Check → Result), kuniga 1 marta**
- Check'dagi barcha mentorlar (`role: mentor | mentor_ta`) Result'ga (Firebase Auth) ko'chiriladi
- Parol pariteti: Check'ning **bcrypt hash**i Firebase Auth'ga import qilinadi →
  mentor Result'ga **Check'dagi xuddi shu telefon + parol** bilan kiradi
- Har mentorning guruhlari va o'quvchilari `users/{uid}/groups|students` ga upsert qilinadi
- ⚠️ Faqat *identity* (ism, guruh, `checkStudentId`) yangilanadi.
  `homeworkScore / attendanceScore / activityScore / coins / records` ga **TEGILMAYDI**
- Check'dan tushib qolgan o'quvchilar `checkActive: false` qilib belgilanadi (o'chirilmaydi)

**2. Push (Result → Check), haftada 1 marta**
- Har o'quvchining haftalik `finalScore` hisoblanadi (Result scoring bilan bir xil)
- `>=75 good`, `50–74 average`, `<50 poor` (env'da sozlanadi)
- `average/poor` bo'lsa — sabab izohi avtomatik yoziladi; `good` bo'lsa izoh yuborilmaydi
- Check'ga `PATCH /api/sync/.../status` yuboriladi. **Locked** statuslar
  (frozen/muzlatilgan/lead/qarzdor/qaytadi) Check tomonidan himoyalangan — tegilmaydi

## O'rnatish

```bash
cd CoddySyncWorker
npm install
cp .env.example .env   # va to'ldiring
```

`.env` da kerak:
- `CHECK_API_URL` — Check backend manzili
- `SYNC_API_KEY` — Check `.env` dagi bilan **aynan bir xil**
- `FIREBASE_SERVICE_ACCOUNT_PATH` — Result Firebase loyihasi service account JSON yo'li

## Ishlatish

```bash
npm run pull     # Check -> Result (bir martalik)
npm run push     # Result -> Check (bir martalik)
npm run sync     # pull + push
npm start        # cron rejimi (kunlik pull + haftalik push)
```

Sinov uchun `.env` da `DRY_RUN=true` — bu rejimda Check'ga hech narsa yozilmaydi, faqat log.

## Check tomonida kerakli sozlama

Check `.env` ga qo'shing:
```
SYNC_API_KEY=<kuchli-tasodifiy-kalit>     # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# ixtiyoriy:
SYNC_ALLOWED_IPS=<worker-server-ip>
```
`/api/sync` route allaqachon `app.js` ga ulangan (faqat shu kalit bilan ishlaydi).
