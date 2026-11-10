# Cyber Garde — الواجهة الأمامية

لوحة تحكم عربية متقدمة لمراقبة أمن الشبكة، مبنية باستخدام **React + Vite + Tailwind CSS + Chart.js**.

## التشغيل

```bash
npm install
npm run dev
```

ثم افتح الرابط المحلي الذي يعرضه Vite، وعادةً يكون:

```text
http://localhost:5173
```

## بنية المشروع

```text
cybergarde-frontend/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── CyberGardeMark.jsx
│   │   ├── dashboard/
│   │   │   ├── DashboardHeader.jsx
│   │   │   ├── DeviceTable.jsx
│   │   │   ├── NetworkHealth.jsx
│   │   │   ├── StatCard.jsx
│   │   │   ├── ThreatIntel.jsx
│   │   │   └── TrafficChart.jsx
│   │   └── layout/
│   │       ├── Sidebar.jsx
│   │       └── Topbar.jsx
│   ├── data/
│   │   └── dashboard.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── vite.config.js
```

## المزايا

- واجهة عربية كاملة باتجاه RTL وخطي **Tajawal** و**Cairo**.
- تصميم داكن بهوية أمن سيبراني، ولمسات نيون سماوية وخضراء.
- قائمة جانبية متجاوبة على اليمين مع نسخة جوال منسدلة.
- شريط علوي يحتوي البحث، الملف الشخصي، ومؤشر «حالة النظام: نشط».
- ثلاث بطاقات إحصائية مع رسوم Sparkline مصغرة.
- رسم بياني تفاعلي لحركة الشبكة باستخدام Chart.js، ببيانات محاكاة تتحدث تلقائيًا.
- جدول أجهزة ذكي مع بحث وتصفية حسب الحالة وشارات متوهجة.
- بطاقة صحة الشبكة، وأحدث التنبيهات، وتوزيع بروتوكولات الشبكة.
- تصدير بيانات الأجهزة إلى ملف CSV من زر «تصدير التقرير».
- دعم اختصار `Ctrl/⌘ + K` للانتقال إلى حقل البحث.

> ملاحظة: جميع البيانات المعروضة محاكاة محليًا في `src/data/dashboard.js` والرسوم البيانية، ولا تتطلب خادمًا خلفيًا.
