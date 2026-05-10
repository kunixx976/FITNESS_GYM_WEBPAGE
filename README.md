# 🏋️ MD Fitness Gym — Premium Fitness Destination

![MD Fitness Header]

MD Fitness is a high-end, premium fitness website designed for Meerut's premier gym. It combines state-of-the-art aesthetics with functional lead generation and member management features.

---

## ✨ Key Features

### 🎨 Premium User Experience
- **Modern Dark Aesthetic**: A sophisticated red, gold, and black theme that conveys power and luxury.
- **Mobile First**: Fully responsive layout optimized for all devices, from desktop monitors to smartphones.
- **Micro-Animations**: Smooth scroll reveal effects using AOS (Animate on Scroll) and parallax backgrounds.
- **Interactive UI**: Custom hover states, 3D card perspectives, and animated counters for gym statistics.

### 🚀 Business Functionality
- **Lead Capture System**: High-conversion landing pages and integrated lead forms.
- **Admin Dashboard**: A secure, password-protected portal for management to track, filter, and manage new leads.
- **Member Transformations**: Dedicated sections showcasing real before-and-after success stories.
- **Real-time API**: Integrated Node.js/Express backend for handling form submissions and database storage.

---

## 🛠️ Technology Stack

### Frontend
- **HTML5**: Semantic structure for SEO and accessibility.
- **CSS3 (Vanilla)**: Custom design system with advanced animations, transitions, and responsive media queries.
- **JavaScript (ES6+)**: Pure JS for core functionality and interactivity.
- **AOS Library**: For professional scroll-reveal animations.
- **Font Awesome**: Premium iconography.

### Backend
- **Node.js & Express**: Robust server architecture.
- **PostgreSQL**: Reliable lead data storage (Supabase/Local).
- **CORS & Dotenv**: Secure cross-origin requests and environment management.

---

## 📂 Project Structure

```text
├── api/                # Backend Node.js/Express server
├── assets/             # SVG and vector assets
├── index.html          # Main website (landing page)
├── admin.html          # Lead management dashboard
├── landing.html        # Special offer / Trial pass page
├── vercel.json         # Deployment configuration
└── package.json        # Dependencies and scripts
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js installed
- PostgreSQL database (or Supabase URL)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/kunixx976/FITNESS_GYM_WEBPAGE.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Create a `.env` file in the root and add:
   ```env
   DATABASE_URL=your_postgresql_url
   ADMIN_PASSWORD=your_secure_password
   ```
4. Start the server:
   ```bash
   npm start
   ```

---

## 🌐 Deployment

This project is optimized for deployment on **Vercel**. 
- Simply connect your GitHub repository to Vercel.
- Environment variables (`DATABASE_URL`, `ADMIN_PASSWORD`) should be added in the Vercel project settings.

---

## 🤝 Contribution

Contributions are welcome! Feel free to open issues or submit pull requests to improve the site.

---

## 📄 License

© 2026 MD Fitness Gym. All rights reserved.
