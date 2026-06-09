# CoddySyncWorker Roadmap

CoddySyncWorker - CoddyCheck va CoddyResults orasidagi alohida sync servis. U Check backenddan mentor, guruh va o'quvchilarni Result Firebase loyihasiga olib o'tadi, Resultdagi baholar asosida Check'ga status qaytaradi.

## Texnologiyalar

- Node.js
- CommonJS
- Firebase Admin SDK
- Axios
- node-cron
- dayjs

## Asosiy buyruqlar

```bash
npm install
npm run pull
npm run push
npm run sync
npm start
```

## Environment

Kerakli envlar:

```env
CHECK_API_URL=
SYNC_API_KEY=
WORKER_RUN_TOKEN=
FIREBASE_SERVICE_ACCOUNT_PATH=
FIREBASE_SERVICE_ACCOUNT=
FIREBASE_SERVICE_ACCOUNT_BASE64=
RESULT_EMAIL_DOMAIN=oquv-natija.local
GOOD_MIN=75
AVERAGE_MIN=50
LESSON_BATCH=6
PULL_CRON=0 3 * * *
PUSH_CRON=0 4 * * 1
TZ=Asia/Tashkent
DRY_RUN=false
```

## Pull flow

1. Check backenddan mentorlar olinadi: `GET /api/sync/mentors`.
2. Har mentor uchun Firebase Auth account yaratiladi yoki import qilinadi.
3. Check'dagi bcrypt password hash Firebase Auth'ga import qilinadi.
4. Mentor profili `teachers/{uid}` ichiga yoziladi.
5. Mentor guruhlari `users/{uid}/groups` ichiga upsert qilinadi.
6. Mentor o'quvchilari `users/{uid}/students` ichiga upsert qilinadi.
7. Check'dan yo'qolgan sync o'quvchilar Result'dan o'chiriladi.
8. Bo'sh sync guruhlar tozalanadi.

## Push flow

1. Firestore `teachers` collectiondan `checkMentorId` bor mentorlar olinadi.
2. Har mentor uchun `users/{uid}/records` o'qiladi.
3. `LESSON_BATCH` bo'yicha oxirgi darslar summary qilinadi.
4. Score `GOOD_MIN` va `AVERAGE_MIN` asosida statusga aylanadi:
   - `good`
   - `average`
   - `poor`
5. Status Check'ga yuboriladi:
   - `PATCH /api/sync/mentors/:mentorId/students/:studentId/status`
6. Muvaffaqiyatli push qilingandan keyin `checkPushedBatch` yangilanadi.

## Dasturchi vazifalari

### 1. Production deploy

- Worker uchun alohida server yoki Render Web Service tayyorlash.
- `/health` endpoint monitoringga ulash.
- Tashqi scheduler orqali `/run/pull`, `/run/push`, `/run/sync` chaqirish.
- Render free sleep bo'lsa tashqi ping kerakligini dokumentatsiya qilish.

### 2. Security

- `SYNC_API_KEY` faqat Worker va Check backend orasida ishlasin.
- `WORKER_RUN_TOKEN` frontenddan faqat run endpointni chaqirish uchun ishlasin.
- Productionda `SYNC_ALLOWED_IPS` backendda yoqilsin.
- Firebase service account base64 yoki secret manager orqali berilsin.

### 3. Reliability

- Pull va push loglarini structured formatga o'tkazish.
- Failed mentor sync davomida boshqa mentorlar to'xtab qolmasin.
- Retry mexanizmi qo'shish.
- Sync result history saqlash.
- `running` lock hozir memoryda, productionda distributed lock kerak bo'lishi mumkin.

### 4. Monitoring

- Oxirgi pull va push vaqti.
- Muvaffaqiyatli va xatoli mentorlar soni.
- Created, linked, updated, removed student count.
- Push qilingan, locked, no data, not found statistikasi.

### 5. Test

- `DRY_RUN=true` bilan push test.
- Fake Check API bilan pull test.
- Firebase emulator bilan integration test.
- Locked statusga push qilinmasligini test qilish.

## Acceptance criteria

- Worker localda `npm run pull`, `npm run push`, `npm run sync` bilan ishlaydi.
- Productionda `/health` javob qaytaradi.
- Pull Check'dagi mentor/guruh/o'quvchini Firebasega olib o'tadi.
- Push Result score asosida Check'da student statusini yangilaydi.
- Locked statuslar hech qachon o'zgarmaydi.

