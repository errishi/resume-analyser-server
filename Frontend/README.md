# GenAI Resume Analyzer - Frontend

A modern React-based frontend for the GenAI Resume Analyzer platform. Built with Vite for lightning-fast development and production builds.

## 📚 Overview

This frontend application provides an intuitive interface for:
- User authentication (registration & login)
- Resume upload and analysis
- Interview report generation
- Professional resume PDF download
- Interview preparation guidance

## 🛠️ Tech Stack

- **React 19.2.4** - UI library
- **Vite 8.0.0** - Build tool & dev server
- **React Router 7.13.2** - Client-side routing
- **Axios 1.13.6** - HTTP client
- **SCSS/SASS 1.98.0** - Styling
- **react-toastify 11.0.5** - Notifications
- **ESLint 9.39.4** - Code quality

## 📁 Directory Structure

```
src/
├── components/
│   ├── LoadingUI.jsx          # Loading spinner component
│   └── ...
├── features/
│   ├── auth/
│   │   ├── components/
│   │   │   └── Protected.jsx  # Route protection component
│   │   ├── hooks/
│   │   │   └── useAuth.js     # Auth hook
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   └── Register.jsx
│   │   ├── services/
│   │   │   └── auth.api.js    # Auth API calls
│   │   ├── auth.context.jsx   # Auth context provider
│   │   └── auth.form.scss     # Auth styles
│   └── interview/
│       ├── hooks/
│       │   └── useInterview.js # Interview hook
│       ├── pages/
│       │   ├── Home.jsx        # Dashboard/upload page
│       │   └── Interview.jsx   # Interview report page
│       ├── services/
│       │   └── interview.api.js # Interview API calls
│       ├── interview.context.jsx
│       └── styles/
│           ├── home.scss
│           └── interview.scss
├── styles/
│   └── button.scss            # Button component styles
├── App.jsx                    # Main app component
├── app.routes.jsx             # Route definitions
├── main.jsx                   # Entry point
└── style.scss                 # Global styles
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16.x or higher
- npm or yarn

### Installation

```bash
# Navigate to frontend directory
cd Frontend

# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the `Frontend/` directory:

```env
VITE_API_URL=http://localhost:5000
```

### Development

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm preview
```

## 📦 Dependencies

### Main Dependencies
- **react** - UI library
- **react-dom** - DOM rendering
- **react-router** - Client-side routing
- **axios** - HTTP client for API calls
- **react-toastify** - Toast notifications
- **sass** - CSS preprocessing

### Dev Dependencies
- **vite** - Build tool
- **@vitejs/plugin-react** - React plugin for Vite
- **eslint** - Code linting
- **eslint-plugin-react-hooks** - React hooks linting
- **eslint-plugin-react-refresh** - React refresh linting

## 🔑 Key Features

### Authentication
- User registration with email validation
- Secure login with JWT tokens
- Protected routes for authenticated users
- Automatic logout on token expiration
- Token stored in browser (memory + optional localStorage)

### Interview Features
- **Resume Upload** - Upload PDF resumes for analysis
- **Report Generation** - Generate AI-powered interview reports
- **Report Viewing** - View detailed interview reports with:
  - Job match score
  - Technical interview questions & answers
  - Behavioral interview questions & answers
  - Identified skill gaps
  - 3-day preparation plan
- **PDF Download** - Download professionally formatted resume PDFs
- **Report History** - View all previously generated reports

### User Experience
- Loading indicators during API calls
- Toast notifications for success/error messages
- Responsive design for mobile and desktop
- Smooth routing transitions
- Error handling for failed API calls

## 🎨 Styling

### Global Styles (`style.scss`)
- Dark theme (#262626 background)
- Pink accent color (#e51a79)
- System font stack
- Base typography and spacing

### Feature-Specific Styles
- `auth.form.scss` - Authentication form styling
- `home.scss` - Dashboard and upload page styling
- `interview.scss` - Interview report page styling
- `button.scss` - Shared button component styles

### CSS Architecture
- SCSS variables for consistent theming
- Nested selectors for component organization
- Responsive breakpoints for mobile support
- Smooth transitions and animations

## 🔗 API Integration

### Authentication API (`auth.api.js`)
- `register(email, password, name)` - Register new user
- `login(email, password)` - Authenticate user
- `logout()` - Logout active user

### Interview API (`interview.api.js`)
- `generateInterviewReport(jobDescription, selfDescription, resumeFile)` - Generate report
- `getAllInterviewReports()` - Fetch all user reports
- `getInterviewReportById(interviewId)` - Fetch specific report
- `downloadInterviewReportPdf(interviewReportId)` - Download resume PDF

## 🔐 Security

- JWT tokens for authentication
- Protected routes preventing unauthorized access
- XSS protection through React's built-in escaping
- CORS configuration on backend
- Secure API endpoints

## 🧪 Linting

```bash
npm run lint
```

Fix linting errors:

```bash
npm run lint -- --fix
```

## 📱 Responsive Design

The application is fully responsive with breakpoints for:
- Mobile (320px - 768px)
- Tablet (768px - 1024px)
- Desktop (1024px+)

## 🆘 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5173
npx kill-port 5173

# Or specify a different port
npm run dev -- --port 3000
```

### API Connection Issues
- Verify `VITE_API_URL` in `.env` matches backend URL
- Ensure backend server is running
- Check CORS settings on backend
- Clear browser cache and cookies

### Module Not Found
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Hot Module Reload (HMR) Issues
- Check Vite configuration in `vite.config.js`
- Clear Vite cache: `rm -rf .vite`
- Restart development server

## 📊 Performance Tips

- Use React DevTools for profiling
- Code splitting with React.lazy() for route components
- Image optimization
- CSS minification in production builds
- Browser caching for static assets

## 🤝 Contributing

1. Follow existing code style
2. Use meaningful component names
3. Add comments for complex logic
4. Test across browsers and devices
5. Keep components small and focused
6. Use custom hooks for reusable logic

## 📄 License

ISC License - see main README.md

## 🔗 Related Files

- Main README: [../README.md](../README.md)
- Backend: [../Backend/README.md](../Backend/README.md)
- Implementation Status: [../IMPLEMENTATION_COMPLETE.md](../IMPLEMENTATION_COMPLETE.md)

---

**Last Updated:** April 2, 2026
