import React from "react";

interface BrandLogoProps {
  className?: string;
  size?: number;
}

export default function BrandLogo({ className = "", size = 42 }: BrandLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300`}
      referrerPolicy="no-referrer"
    >
      {/* Outer Hexagon with rounded corners */}
      <path
        d="M60 8 L106 34.5 C109.5 36.5 111.5 40.2 111.5 44.2 L111.5 95.8 C111.5 99.8 109.5 103.5 106 105.5 L60 132 L14 105.5 C10.5 103.5 8.5 99.8 8.5 95.8 L8.5 44.2 C8.5 40.2 10.5 36.5 14 34.5 L60 8 Z"
        stroke="#FF6A00"
        strokeWidth="11"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Main Stylized Letter 'A' and Paper-plane combo */}
      {/* Back leg of 'A' */}
      <path
        d="M60 26 L94 88 M60 26 L38 66"
        stroke="#003A8C"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Jet Pointer Plane (cutting across the A) */}
      <path
        d="M28 85 L76 56 L46 51 Z"
        fill="#003A8C"
        stroke="#003A8C"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      
      {/* Extra interior wing shader for the jet pointer */}
      <path
        d="M28 85 L76 56 L44 65 Z"
        fill="#002D6E"
        opacity="0.85"
      />

      {/* Small orange accent capsule/parallelogram in the bottom-right/center */}
      <path
        d="M52 87 C52 84.5 54 82.5 56.5 82.5 L73 82.5 C75.5 82.5 77.5 84.5 77.5 87 L77.5 89 C77.5 91.5 75.5 93.5 73 93.5 L56.5 93.5 C54 93.5 52 91.5 52 89 Z"
        fill="#FF6A00"
        transform="rotate(-25 65 88)"
      />
    </svg>
  );
}
