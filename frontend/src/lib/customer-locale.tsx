import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CustomerLocale = "en" | "kk" | "ru";
const STORAGE_KEY = "kezek-customer-locale-v1";
const supported: CustomerLocale[] = ["en", "kk", "ru"];

const copy: Record<string, Record<Exclude<CustomerLocale, "en">, string>> = {
  "Page not found": { kk: "Бет табылмады", ru: "Страница не найдена" },
  "The page you're looking for doesn't exist or has been moved.": {
    kk: "Сіз іздеген бет жоқ немесе басқа жерге көшірілген.",
    ru: "Страница, которую вы ищете, не существует или была перемещена.",
  },
  "Go home": { kk: "Басты бетке өту", ru: "На главную" },
  "This page didn't load": { kk: "Бет жүктелмеді", ru: "Не удалось загрузить страницу" },
  "Something went wrong on our end. You can try refreshing or head back home.": {
    kk: "Бізде бір қате пайда болды. Бетті жаңартып немесе басты бетке өтіп көріңіз.",
    ru: "Что-то пошло не так. Обновите страницу или вернитесь на главную.",
  },
  "Try again": { kk: "Қайталап көру", ru: "Повторить" },
  "Skip to content": { kk: "Мазмұнға өту", ru: "Перейти к содержимому" },
  "Main navigation": { kk: "Негізгі навигация", ru: "Основная навигация" },
  "Kezek home": { kk: "Kezek басты беті", ru: "Главная Kezek" },
  Explore: { kk: "Қызметтер", ru: "Услуги" },
  "My Tickets": { kk: "Менің талондарым", ru: "Мои талоны" },
  Staff: { kk: "Қызметкерлер", ru: "Сотрудники" },
  Admin: { kk: "Әкімші", ru: "Администратор" },
  "Demo mode": { kk: "Демо режим", ru: "Демо-режим" },
  "Sign out": { kk: "Шығу", ru: "Выйти" },
  "Staff sign in": { kk: "Қызметкер ретінде кіру", ru: "Вход для сотрудников" },
  "Your time, back in your hands.": {
    kk: "Уақытыңыз өз қолыңызда.",
    ru: "Ваше время снова в ваших руках.",
  },
  "Virtual queues for Kazakhstan · No customer account needed": {
    kk: "Қазақстандағы электрондық кезек · Клиентке аккаунт қажет емес",
    ru: "Электронная очередь в Казахстане · Аккаунт не нужен",
  },
  Language: { kk: "Тіл", ru: "Язык" },
  "LESS WAITING. MORE LIVING.": { kk: "АЗ КҮТУ. КӨП ӨМІР.", ru: "МЕНЬШЕ ОЖИДАНИЯ. БОЛЬШЕ ЖИЗНИ." },
  "Skip the waiting.": { kk: "Кезекті күтпеңіз.", ru: "Не стойте в очереди." },
  "Keep your place.": { kk: "Орныңызды сақтаңыз.", ru: "Сохраняйте своё место." },
  "Your next visit, without the line. Find an organization, join its queue, and follow your place from anywhere.":
    {
      kk: "Кезексіз қызмет алыңыз. Ұйымды тауып, кезекке қосылып, орныңызды кез келген жерден бақылаңыз.",
      ru: "Получайте услуги без очереди. Найдите организацию, встаньте в очередь и следите за своим местом откуда угодно.",
    },
  "No account needed": { kk: "Аккаунт қажет емес", ru: "Аккаунт не нужен" },
  "Live queue updates": { kk: "Кезек жаңартулары", ru: "Обновления очереди" },
  "A LITTLE LESS WAITING": { kk: "АЗДАП КҮТУ", ru: "НЕМНОГО МЕНЬШЕ ОЖИДАНИЯ" },
  "Life goes on.": { kk: "Өмір жалғаса береді.", ru: "Жизнь продолжается." },
  "Your place stays.": { kk: "Орныңыз сақталады.", ru: "Ваше место за вами." },
  "A queue that moves with you": {
    kk: "Сізбен бірге қозғалатын кезек",
    ru: "Очередь, которая движется вместе с вами",
  },
  "You’re free to get on with your day": {
    kk: "Күніңізді жалғастыра беріңіз",
    ru: "Продолжайте заниматься своими делами",
  },
  "Search organizations and services": {
    kk: "Ұйымдар мен қызметтерді іздеу",
    ru: "Поиск организаций и услуг",
  },
  "Search organizations, services, or cities…": {
    kk: "Ұйымды, қызметті немесе қаланы іздеу…",
    ru: "Найти организацию, услугу или город…",
  },
  "All organizations": { kk: "Барлық ұйымдар", ru: "Все организации" },
  "Organization categories": { kk: "Ұйым санаттары", ru: "Категории организаций" },
  Universities: { kk: "Университеттер", ru: "Университеты" },
  Clinics: { kk: "Клиникалар", ru: "Клиники" },
  "Government Services": { kk: "Мемлекеттік қызметтер", ru: "Государственные услуги" },
  "Service Centers": { kk: "Қызмет көрсету орталықтары", ru: "Сервисные центры" },
  "Find your next stop": {
    kk: "Келесі баратын жеріңізді табыңыз",
    ru: "Найдите нужную организацию",
  },
  "Explore organizations and choose the service you need.": {
    kk: "Ұйымдарды қарап, қажет қызметті таңдаңыз.",
    ru: "Выберите организацию и нужную услугу.",
  },
  organization: { kk: "ұйым", ru: "организация" },
  organizations: { kk: "ұйым", ru: "организации" },
  "No matching organizations": {
    kk: "Сәйкес ұйымдар табылмады",
    ru: "Подходящие организации не найдены",
  },
  "No organizations available yet": {
    kk: "Әзірге ұйымдар жоқ",
    ru: "Пока нет доступных организаций",
  },
  "Try another search or category.": {
    kk: "Басқа сөзді немесе санатты іздеп көріңіз.",
    ru: "Попробуйте другой запрос или категорию.",
  },
  "Please check back soon.": { kk: "Кейінірек қайта кіріңіз.", ru: "Загляните сюда позже." },
  "Reset filters": { kk: "Сүзгілерді тазарту", ru: "Сбросить фильтры" },
  "Couldn’t reach the organization service": {
    kk: "Ұйымдар қызметіне қосылу мүмкін болмады",
    ru: "Не удалось подключиться к каталогу организаций",
  },
  "Start the Kezek backend and check its API address, then retry.": {
    kk: "Kezek серверін іске қосып, API мекенжайын тексеріп, қайта көріңіз.",
    ru: "Запустите сервер Kezek, проверьте адрес API и повторите попытку.",
  },
  "A better way to wait": {
    kk: "Күтудің ыңғайлы жолы",
    ru: "Удобный способ дождаться своей очереди",
  },
  "Three steps. One less line.": {
    kk: "Үш қадам. Бір кезекке аз.",
    ru: "Три шага. Одной очередью меньше.",
  },
  "Find your service": { kk: "Қызметті табыңыз", ru: "Найдите услугу" },
  "Browse participating organizations and check queue availability.": {
    kk: "Қатысушы ұйымдарды қарап, кезек жағдайын тексеріңіз.",
    ru: "Выберите организацию и проверьте доступность очереди.",
  },
  "Take a digital ticket": { kk: "Электрондық талон алыңыз", ru: "Получите электронный талон" },
  "Confirm your place in an open queue. No signup, no paperwork.": {
    kk: "Ашық кезектегі орныңызды растаңыз. Тіркелу де, құжат та қажет емес.",
    ru: "Подтвердите место в открытой очереди. Без регистрации и бумаг.",
  },
  "Arrive when it’s your turn": {
    kk: "Кезегіңіз келгенде барыңыз",
    ru: "Приходите, когда подойдёт очередь",
  },
  "Keep your ticket open to follow your position and counter updates.": {
    kk: "Орныңыз бен қызмет көрсету терезесін бақылау үшін талонды ашық ұстаңыз.",
    ru: "Откройте талон, чтобы следить за очередью и номером окна.",
  },
  "Queues open": { kk: "Кезек ашық", ru: "Очередь открыта" },
  "Queues closed": { kk: "Кезек жабық", ru: "Очередь закрыта" },
  service: { kk: "қызмет", ru: "услуга" },
  services: { kk: "қызмет", ru: "услуги" },
  "From ~{minutes} min wait": {
    kk: "Шамамен {minutes} мин күту",
    ru: "Ожидание примерно {minutes} мин",
  },
  "Wait estimate unavailable": { kk: "Күту уақыты белгісіз", ru: "Время ожидания неизвестно" },
  "View Services": { kk: "Қызметтерді көру", ru: "Посмотреть услуги" },
  "Location not provided": { kk: "Мекенжай көрсетілмеген", ru: "Адрес не указан" },
  "Service hours listed below": {
    kk: "Қызмет көрсету уақыты төменде көрсетілген",
    ru: "Часы работы указаны ниже",
  },
  "Choose a service": { kk: "Қызметті таңдаңыз", ru: "Выберите услугу" },
  "Check the live queue, then take your place.": {
    kk: "Кезектің жағдайын тексеріп, орныңызды алыңыз.",
    ru: "Проверьте очередь и займите своё место.",
  },
  "No services are available at this organization yet.": {
    kk: "Бұл ұйымда әзірге қызметтер жоқ.",
    ru: "В этой организации пока нет доступных услуг.",
  },
  Open: { kk: "Ашық", ru: "Открыта" },
  Closed: { kk: "Жабық", ru: "Закрыта" },
  "Join Queue": { kk: "Кезекке қосылу", ru: "Встать в очередь" },
  "Queue closed": { kk: "Кезек жабық", ru: "Очередь закрыта" },
  Hours: { kk: "Жұмыс уақыты", ru: "Часы работы" },
  "Not provided — check queue availability": {
    kk: "Көрсетілмеген — кезек жағдайын тексеріңіз",
    ru: "Не указано — проверьте доступность очереди",
  },
  "Back to services": { kk: "Қызметтерге оралу", ru: "Назад к услугам" },
  "Couldn’t check queue availability.": {
    kk: "Кезектің жағдайын тексеру мүмкін болмады.",
    ru: "Не удалось проверить очередь.",
  },
  "One step away": { kk: "Тағы бір қадам", ru: "Остался один шаг" },
  "Confirm your place": { kk: "Орныңызды растаңыз", ru: "Подтвердите место" },
  "Confirm once to receive a private digital ticket. If your connection drops, retrying will recover the same place instead of creating a duplicate.":
    {
      kk: "Жеке электрондық талон алу үшін бір рет растаңыз. Байланыс үзіліп қалса, қайталау жаңа талон жасамай, сол орынды қалпына келтіреді.",
      ru: "Подтвердите один раз, чтобы получить личный электронный талон. Если связь прервётся, повторный запрос восстановит то же место, а не создаст новый талон.",
    },
  "Service unavailable": { kk: "Қызмет қолжетімсіз", ru: "Услуга недоступна" },
  "Queue open": { kk: "Кезек ашық", ru: "Очередь открыта" },
  waiting: { kk: "күтуде", ru: "ожидают" },
  "~{minutes} min wait": { kk: "~{minutes} мин күту", ru: "ожидание ~{minutes} мин" },
  person: { kk: "адам", ru: "человек" },
  people: { kk: "адам", ru: "человека" },
  "wait estimate unavailable": { kk: "күту уақыты белгісіз", ru: "время ожидания неизвестно" },
  "about {minutes} min wait": {
    kk: "шамамен {minutes} мин күту",
    ru: "ожидание около {minutes} мин",
  },
  "Your place is confirmed when the ticket appears. Wait times are approximate. You can cancel while waiting.":
    {
      kk: "Талон шыққанда орныңыз расталады. Күту уақыты шамамен көрсетіледі. Күтіп тұрғанда кезектен бас тарта аласыз.",
      ru: "Ваше место подтверждается после появления талона. Время ожидания примерное. Пока ждёте, можно отменить очередь.",
    },
  "This service isn’t accepting new visitors right now. Please choose another service or check back later.":
    {
      kk: "Бұл қызмет қазір жаңа келушілерді қабылдамайды. Басқа қызметті таңдаңыз немесе кейінірек көріңіз.",
      ru: "Сейчас эта услуга не принимает новых посетителей. Выберите другую услугу или вернитесь позже.",
    },
  "This queue is not accepting visitors right now.": {
    kk: "Бұл кезек қазір келушілерді қабылдамайды.",
    ru: "Очередь сейчас не принимает посетителей.",
  },
  "If the connection was interrupted, retry here to recover the original ticket safely.": {
    kk: "Байланыс үзілсе, осы жерден қайталап, бұрынғы талонды қауіпсіз қалпына келтіріңіз.",
    ru: "Если связь прервалась, повторите запрос здесь, чтобы безопасно восстановить прежний талон.",
  },
  "Queue availability has been refreshed. Review the status before trying again.": {
    kk: "Кезек жағдайы жаңартылды. Қайталап көрмес бұрын мәртебесін тексеріңіз.",
    ru: "Статус очереди обновлён. Проверьте его перед повторной попыткой.",
  },
  "A request for another queue may still have created a ticket. Recover it before starting a new queue.":
    {
      kk: "Басқа кезекке жіберілген сұрау талон жасаған болуы мүмкін. Жаңа кезекке дейін оны қалпына келтіріңіз.",
      ru: "Запрос в другую очередь мог создать талон. Восстановите его, прежде чем занимать новое место.",
    },
  "Checking previous request…": {
    kk: "Алдыңғы сұрау тексерілуде…",
    ru: "Проверяем предыдущий запрос…",
  },
  "Recover previous ticket": {
    kk: "Алдыңғы талонды қалпына келтіру",
    ru: "Восстановить предыдущий талон",
  },
  "You can retry this recovery safely.": {
    kk: "Қалпына келтіруді қауіпсіз қайталауға болады.",
    ru: "Восстановление можно безопасно повторить.",
  },
  "Issuing your ticket…": { kk: "Талон жасалуда…", ru: "Оформляем талон…" },
  "Opening your ticket…": { kk: "Талоныңыз ашылуда…", ru: "Открываем ваш талон…" },
  "Retry ticket request": { kk: "Талон сұрауын қайталау", ru: "Повторить запрос талона" },
  "The ticket request could not be completed. Review queue availability and retry.": {
    kk: "Талон сұрауы аяқталмады. Кезек жағдайын тексеріп, қайталап көріңіз.",
    ru: "Не удалось оформить талон. Проверьте очередь и повторите попытку.",
  },
  "The previous ticket could not be recovered. Please retry safely.": {
    kk: "Алдыңғы талонды қалпына келтіру мүмкін болмады. Қауіпсіз түрде қайталап көріңіз.",
    ru: "Не удалось восстановить предыдущий талон. Безопасно повторите попытку.",
  },
  "Ticket cancellation could not be completed. Refresh to see the current status.": {
    kk: "Талонның күшін жою мүмкін болмады. Ағымдағы мәртебені көру үшін жаңартыңыз.",
    ru: "Не удалось отменить талон. Обновите страницу, чтобы увидеть текущий статус.",
  },
  "Confirm & join queue": {
    kk: "Растау және кезекке қосылу",
    ru: "Подтвердить и встать в очередь",
  },
  "No account. No personal details.": {
    kk: "Аккаунт қажет емес. Жеке деректер сұралмайды.",
    ru: "Без аккаунта и личных данных.",
  },
  "Ticket unavailable. Open the full private link you received, or try again.": {
    kk: "Талон қолжетімсіз. Алған жеке сілтемеңізді толық ашыңыз немесе қайталап көріңіз.",
    ru: "Талон недоступен. Откройте полную личную ссылку или попробуйте ещё раз.",
  },
  "Live updates paused. Showing the last confirmed state. Retry to refresh.": {
    kk: "Нақты уақыттағы жаңарту тоқтады. Соңғы расталған күй көрсетілген. Жаңарту үшін қайталаңыз.",
    ru: "Обновления приостановлены. Показано последнее подтверждённое состояние. Повторите запрос.",
  },
  "Your digital ticket": { kk: "Электрондық талоныңыз", ru: "Ваш электронный талон" },
  called: { kk: "шақырылды", ru: "вызван" },
  serving: { kk: "қызмет көрсетілуде", ru: "обслуживается" },
  completed: { kk: "аяқталды", ru: "завершён" },
  cancelled: { kk: "күші жойылды", ru: "отменён" },
  "no show": { kk: "келмеді", ru: "не явился" },
  "You’re in the queue": { kk: "Сіз кезектесіз", ru: "Вы в очереди" },
  "It’s your turn!": { kk: "Кезегіңіз келді!", ru: "Ваша очередь!" },
  "You’re being served": { kk: "Сізге қызмет көрсетіліп жатыр", ru: "Вас обслуживают" },
  "All done. Enjoy your day!": {
    kk: "Бәрі дайын. Күніңіз сәтті өтсін!",
    ru: "Готово. Хорошего дня!",
  },
  "Your ticket is cancelled": { kk: "Талоныңыздың күші жойылды", ru: "Ваш талон отменён" },
  "You missed your turn": { kk: "Кезегіңізді өткізіп алдыңыз", ru: "Вы пропустили очередь" },
  "Your place is saved. Keep this page open for updates.": {
    kk: "Орныңыз сақталды. Жаңартулар үшін осы бетті ашық ұстаңыз.",
    ru: "Ваше место сохранено. Не закрывайте страницу, чтобы видеть обновления.",
  },
  "Please make your way to the assigned counter.": {
    kk: "Тағайындалған терезеге өтіңіз.",
    ru: "Подойдите к назначенному окну.",
  },
  "You can join a new queue when you’re ready.": {
    kk: "Дайын болғанда жаңа кезекке қосыла аласыз.",
    ru: "Когда будете готовы, можно встать в новую очередь.",
  },
  "The team is taking care of your request.": {
    kk: "Қызметкерлер сұрауыңызды орындап жатыр.",
    ru: "Сотрудники обрабатывают ваш запрос.",
  },
  "You can find this ticket again in My Tickets.": {
    kk: "Бұл талонды «Менің талондарым» бөлімінен қайта таба аласыз.",
    ru: "Вы найдёте этот талон в разделе «Мои талоны».",
  },
  "People ahead of you": { kk: "Сіздің алдыңызда", ru: "Перед вами" },
  min: { kk: "мин", ru: "мин" },
  "Estimate unavailable": { kk: "Болжам қолжетімсіз", ru: "Оценка недоступна" },
  "Estimated wait": { kk: "Күту уақыты", ru: "Ожидание" },
  "Your assigned counter": { kk: "Сіздің терезеңіз", ru: "Ваше окно" },
  "Please ask a staff member": { kk: "Қызметкерден сұраңыз", ru: "Уточните у сотрудника" },
  "TICKET UPDATES": { kk: "ТАЛОН ЖАҢАРТУЛАРЫ", ru: "ОБНОВЛЕНИЯ ТАЛОНА" },
  "Ticket issued": { kk: "Талон берілді", ru: "Талон выдан" },
  "Called to counter": { kk: "Терезеге шақырылды", ru: "Вызван к окну" },
  "Service started": { kk: "Қызмет басталды", ru: "Обслуживание началось" },
  Cancelled: { kk: "Күші жойылды", ru: "Отменён" },
  "Marked no-show": { kk: "Келмеді деп белгіленді", ru: "Отмечен как неявившийся" },
  "Service finished": { kk: "Қызмет аяқталды", ru: "Обслуживание завершено" },
  "Cancel your ticket?": { kk: "Талонның күшін жоясыз ба?", ru: "Отменить талон?" },
  "You’ll lose your current place in the queue. You can join again later.": {
    kk: "Кезектегі қазіргі орныңыздан айырыласыз. Кейін қайта қосыла аласыз.",
    ru: "Вы потеряете место в очереди. Позже можно будет встать снова.",
  },
  "Go back": { kk: "Қайту", ru: "Назад" },
  Confirm: { kk: "Растау", ru: "Подтвердить" },
  "Cancel Ticket": { kk: "Талоннан бас тарту", ru: "Отменить талон" },
  "Ticket cancelled": { kk: "Талонның күші жойылды", ru: "Талон отменён" },
  "Private ticket link copied": {
    kk: "Жеке талон сілтемесі көшірілді",
    ru: "Личная ссылка на талон скопирована",
  },
  "Couldn’t copy. Bookmark this page instead.": {
    kk: "Көшіру мүмкін болмады. Бұл бетті бетбелгіге қосыңыз.",
    ru: "Не удалось скопировать. Добавьте страницу в закладки.",
  },
  "Copy private ticket link": {
    kk: "Жеке талон сілтемесін көшіру",
    ru: "Скопировать личную ссылку",
  },
  "Keep this link private. Anyone with it can view or cancel this ticket.": {
    kk: "Бұл сілтемені құпия сақтаңыз. Оны алған кез келген адам талонды көріп, күшін жоя алады.",
    ru: "Не передавайте ссылку. Любой, у кого она есть, может посмотреть или отменить талон.",
  },
  "Refreshes every 5 seconds.": {
    kk: "Әр 5 секунд сайын жаңартылады.",
    ru: "Обновляется каждые 5 секунд.",
  },
  "This visit has ended.": { kk: "Бұл қызмет көрсету аяқталды.", ru: "Обслуживание завершено." },
  "Explore organizations": { kk: "Ұйымдарды қарау", ru: "Посмотреть организации" },
  "Your visits": { kk: "Сапарларыңыз", ru: "Ваши визиты" },
  "Tickets saved on this browser, including available history. Keep your private ticket links to open them on another device. Anyone with a link can access that ticket.":
    {
      kk: "Осы браузерде сақталған талондар және қолжетімді тарих. Басқа құрылғыдан ашу үшін жеке сілтемелерді сақтаңыз. Сілтемені алған кез келген адам талонға кіре алады.",
      ru: "Талоны и доступная история сохранены в этом браузере. Сохраните личную ссылку, чтобы открыть талон на другом устройстве. По ссылке доступен этот талон.",
    },
  "Your next visit starts here": {
    kk: "Келесі сапарыңыз осы жерден басталады",
    ru: "Начните следующий визит здесь",
  },
  "No tickets saved on this browser. Already have one? Open your private ticket link.": {
    kk: "Бұл браузерде сақталған талон жоқ. Талоныңыз бар ма? Жеке сілтемеңізді ашыңыз.",
    ru: "В этом браузере нет сохранённых талонов. Уже получили талон? Откройте личную ссылку.",
  },
  "A saved ticket is unavailable. Its link may have expired, or the service may be offline.": {
    kk: "Сақталған талон қолжетімсіз. Сілтеменің мерзімі өтуі немесе қызмет істемеуі мүмкін.",
    ru: "Сохранённый талон недоступен. Возможно, ссылка устарела или сервис временно не работает.",
  },
  "Loading saved ticket…": { kk: "Сақталған талон жүктелуде…", ru: "Загружаем сохранённый талон…" },
  Loading: { kk: "Жүктелуде", ru: "Загрузка" },
  Retry: { kk: "Қайталау", ru: "Повторить" },
  "We couldn’t load this organization. It may no longer be available.": {
    kk: "Ұйымды жүктеу мүмкін болмады. Ол енді қолжетімсіз болуы мүмкін.",
    ru: "Не удалось загрузить организацию. Возможно, она больше недоступна.",
  },
  "Last updated {time}.": { kk: "Соңғы жаңарту: {time}.", ru: "Обновлено: {time}." },
};

type Unit = "organization" | "service" | "person";
const pluralForms: Record<CustomerLocale, Record<Unit, Record<Intl.LDMLPluralRule, string>>> = {
  en: {
    organization: {
      zero: "organizations",
      one: "organization",
      two: "organizations",
      few: "organizations",
      many: "organizations",
      other: "organizations",
    },
    service: {
      zero: "services",
      one: "service",
      two: "services",
      few: "services",
      many: "services",
      other: "services",
    },
    person: {
      zero: "people",
      one: "person",
      two: "people",
      few: "people",
      many: "people",
      other: "people",
    },
  },
  kk: {
    organization: {
      zero: "ұйым",
      one: "ұйым",
      two: "ұйым",
      few: "ұйым",
      many: "ұйым",
      other: "ұйым",
    },
    service: {
      zero: "қызмет",
      one: "қызмет",
      two: "қызмет",
      few: "қызмет",
      many: "қызмет",
      other: "қызмет",
    },
    person: { zero: "адам", one: "адам", two: "адам", few: "адам", many: "адам", other: "адам" },
  },
  ru: {
    organization: {
      zero: "организаций",
      one: "организация",
      two: "организации",
      few: "организации",
      many: "организаций",
      other: "организации",
    },
    service: {
      zero: "услуг",
      one: "услуга",
      two: "услуги",
      few: "услуги",
      many: "услуг",
      other: "услуги",
    },
    person: {
      zero: "человек",
      one: "человек",
      two: "человека",
      few: "человека",
      many: "человек",
      other: "человека",
    },
  },
};

function browserLocale(): CustomerLocale {
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const match = languages
    .map((language) => language.toLowerCase().split(/[-_]/)[0])
    .find((language) => language === "kk" || language === "ru");
  return match === "kk" || match === "ru" ? match : "en";
}

function isLocale(value: string | null): value is CustomerLocale {
  return value !== null && supported.includes(value as CustomerLocale);
}

const LocaleContext = createContext<{
  locale: CustomerLocale;
  setLocale: (locale: CustomerLocale) => void;
  t: (message: string, values?: Record<string, string | number>) => string;
  tError: (message: string, fallback: string) => string;
  formatNumber: (value: number) => string;
  formatCount: (value: number, unit: Unit) => string;
  formatDate: (value: string | number | Date) => string;
  formatTime: (value: string | number | Date) => string;
  formatOperatingHours: (value: string | null) => string;
}>({
  locale: "en",
  setLocale: () => undefined,
  t: (message) => message,
  tError: (message) => message,
  formatNumber: (value) => String(value),
  formatCount: (value, unit) => `${value} ${pluralForms.en[unit].other}`,
  formatDate: (value) => new Date(value).toLocaleDateString("en"),
  formatTime: (value) =>
    new Date(value).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }),
  formatOperatingHours: (value) => value ?? "",
});

export function CustomerLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<CustomerLocale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    setLocaleState(isLocale(saved) ? saved : browserLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => {
    const setLocale = (next: CustomerLocale) => {
      window.localStorage.setItem(STORAGE_KEY, next);
      setLocaleState(next);
    };
    const t = (message: string, values: Record<string, string | number> = {}) => {
      let translated = locale === "en" ? message : (copy[message]?.[locale] ?? message);
      for (const [key, replacement] of Object.entries(values)) {
        const rendered =
          typeof replacement === "number"
            ? new Intl.NumberFormat(locale).format(replacement)
            : replacement;
        translated = translated.replaceAll(`{${key}}`, rendered);
      }
      return translated;
    };
    const tError = (message: string, fallback: string) => {
      if (locale === "en") return message;
      return copy[message]?.[locale] ?? t(fallback);
    };
    const formatNumber = (value: number) => new Intl.NumberFormat(locale).format(value);
    const formatCount = (value: number, unit: Unit) => {
      const category = new Intl.PluralRules(locale).select(value);
      const forms = pluralForms[locale][unit];
      return `${formatNumber(value)} ${forms[category] ?? forms.other}`;
    };
    const formatDate = (value: string | number | Date) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
    const formatTime = (value: string | number | Date) =>
      new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
        new Date(value),
      );
    const formatOperatingHours = (value: string | null) => {
      if (!value) return "";
      const match = /^(\d{2}):(\d{2})[–-](\d{2}):(\d{2})$/.exec(value);
      if (!match) return value;
      const clock = (hour: string, minute: string) =>
        new Intl.DateTimeFormat(locale, {
          hour: locale === "en" ? "numeric" : "2-digit",
          minute: "2-digit",
          ...(locale === "en" ? { hour12: true } : { hourCycle: "h23" as const }),
          timeZone: "UTC",
        }).format(new Date(Date.UTC(2000, 0, 1, Number(hour), Number(minute))));
      return `${clock(match[1]!, match[2]!)}–${clock(match[3]!, match[4]!)}`;
    };
    return {
      locale,
      setLocale,
      t,
      tError,
      formatNumber,
      formatCount,
      formatDate,
      formatTime,
      formatOperatingHours,
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useCustomerLocale() {
  return useContext(LocaleContext);
}
