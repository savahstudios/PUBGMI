/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // BUG-86 FIXED: Use CSS variables so colors respond to dark/light toggle
        bg: {
          primary:   'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          card:      'var(--bg-card)',
          sidebar:   'var(--bg-sidebar)'
        },
        accent: {
          blue:   '#00D4FF',
          purple: '#8B5CF6',
          red:    '#FF3B3B',
          orange: '#FF6B35',
          green:  '#00FF88'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      backdropBlur: { glass: '12px' },
      boxShadow: {
        glass:        '0 4px 24px rgba(0,212,255,0.06)',
        glow:         '0 0 20px rgba(0,212,255,0.3)',
        'glow-purple':'0 0 20px rgba(139,92,246,0.3)',
        'glow-red':   '0 0 20px rgba(255,59,59,0.3)'
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in':'slideIn 0.3s ease-out'
      }
    }
  },
  plugins: []
};
