'use client'

import React from 'react'

interface AloLogoProps {
  size?: number
  className?: string
}

export function AloLogo({ size = 40, className = '' }: AloLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M20 2L37 11V29L20 38L3 29V11L20 2Z"
        stroke="#E8501A"
        strokeWidth="2.5"
        fill="#0066CC"
        fillOpacity="0.1"
      />
      <path
        d="M20 2L37 11V29L20 38L3 29V11L20 2Z"
        stroke="#E8501A"
        strokeWidth="2.5"
        fill="none"
      />
      <text
        x="20"
        y="25"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill="#0066CC"
      >
        A
      </text>
      <rect x="14" y="28" width="12" height="2.5" rx="1.25" fill="#E8501A" />
    </svg>
  )
}