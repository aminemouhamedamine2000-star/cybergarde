import { useId } from 'react';

export default function CyberGardeMark({ className = 'h-9 w-9' }) {
  const gradientId = `cg-gradient-${useId().replace(/:/g, '')}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" y1="6" x2="55" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="0.5" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#4ade80" />
        </linearGradient>
      </defs>

      <path
        d="M32 5.5 55 14.6v16.9C55 44.4 46.4 55.5 32 60 17.6 55.5 9 44.4 9 31.5V14.6L32 5.5Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M32 15.5 47 21v10.1c0 8.4-5.7 16.1-15 19.7-9.3-3.6-15-11.3-15-19.7V21l15-5.5Z"
        fill="#06131e"
        stroke={`url(#${gradientId})`}
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      <path
        d="M32 22v20M23.5 28.5 32 22l8.5 6.5M23.5 37.5 32 44l8.5-6.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="33" r="3.4" fill="#4ade80" />
      <circle cx="32" cy="33" r="6.2" stroke="#4ade80" strokeOpacity="0.28" />
    </svg>
  );
}
