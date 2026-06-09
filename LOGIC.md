# CoddySyncWorker Logic

Bu papka CoddyCheck va CoddyResults orasida bridge vazifasini bajaradi. Node.js CommonJS worker.

## Buyruqlar

`package.json` scriptlari:

- `npm run pull`: `node src/index.js pull`, Check -> Results.
- `npm run push`: `node src/index.js push`, Results -> Check.
- `npm run sync`: `node src/index.js all`, avval pull, keyin push.
- `npm start`: `src/server.js`, health server + `/run/*` endpoint + cron.
- `npm run cron`: `src/cron.js`, faqat cron joblar.

## Config

`src/config.js` envlarni o'qiydi va `assertReady()` bilan majburiy sozlamalarni tekshiradi. Muhim qiymatlar:

- Check backend API URL va sync key.
- Firebase admin credentials.
- Pull/push cron expression.
- Timezone.
- `dryRun`.
- Lesson batch soni.
- Worker run token.

## Check client

`src/checkClient.js` Check backend bilan gaplashadigan HTTP client. Pull uchun mentor/guruh/student ma'lumotlarini oladi, push uchun student statusini patch qiladi.

## Pull: Check -> Results

`src/sync/pullFromCheck.js`:

1. Check'dan mentorlar, guruhlar va o'quvchilarni oladi.
2. Har mentor uchun Firebase Auth accountni ta'minlaydi.
3. `teachers/{uid}` profiliga `checkMentorId` va sync metadata yozadi.
4. `users/{uid}/groups` ichida guruhlarni `checkGroupId` bo'yicha upsert qiladi.
5. Guruh nomi Check'da o'zgargan bo'lsa, studentlarning `group` fieldini ham yangilaydi.
6. `users/{uid}/students` ichida o'quvchilarni `checkStudentId` yoki `name+group` orqali bog'laydi/upsert qiladi.
7. Check'da yo'qolgan yoki bo'shab qolgan sync guruh/studentlarni inactive/cleanup qiladi.

Muhim qoida: pull identity fieldlarni yangilaydi, lekin Results ichidagi `homeworkScore`, `attendanceScore`, `activityScore`, `coins`, `records` kabi hisob-kitob data buzilmasligi kerak.

## Push: Results -> Check

`src/sync/pushToCheck.js`:

1. `teachers` collectiondan `checkMentorId` bor teacherlarni topadi.
2. Har teacher uchun `users/{uid}/settings/reward-system`, `records`, `students`ni o'qiydi.
3. `checkStudentId` bor, locked emas, active studentlarni oladi.
4. Oxirgi lesson batch bo'yicha `lastLessonsSummary()` bilan score summary hisoblaydi.
5. `buildStatusBody()` Check tushunadigan `frozenStatus/comment` body yasaydi.
6. `check.patchStudentStatus()` orqali Check backendga yuboradi.
7. Auto rejimda bir xil batch qayta yuborilmasligi uchun `checkPushedBatch` saqlaydi.

`dryRun` yoqilgan bo'lsa, Check'ga yozmaydi, faqat log chiqaradi.

## Server rejim

`src/server.js` Render/Web Service uchun:

- `/` va `/health`: service status, running flag va lastRun.
- `/run/pull?key=...`: pull jobni fonda boshlaydi.
- `/run/push?key=...`: push jobni fonda boshlaydi.
- `/run/sync?key=...`: pull + push jobni fonda boshlaydi.

`key` `SYNC_API_KEY` yoki `WORKER_RUN_TOKEN`ga teng bo'lishi kerak. Job ishlayotgan paytda ikkinchi job 409 bilan rad etiladi.

Server ichida cron ham bor:

- `config.pullCron`: Check -> Results.
- `config.pushCron`: Results -> Check, auto push yoqilgan mentorlar uchun.

## Cron-only rejim

`src/cron.js` HTTP server ochmaydi. Faqat node-cron orqali pull/push joblarni yuritadi. Oldingi job tugamagan bo'lsa yangisini o'tkazib yuboradi.

## Papkalar

- `src/sync`: pull va push asosiy biznes-logikasi.
- `src/lib`: scoring va Check status body yasash.
- `src/config.js`: env va runtime sozlamalar.
- `src/firebaseAdmin.js`: Firebase Admin SDK ulanishi.
- `src/checkClient.js`: Check backend API client.
- `src/index.js`: CLI entrypoint.
- `src/server.js`: HTTP + cron entrypoint.
- `src/cron.js`: cron-only entrypoint.

