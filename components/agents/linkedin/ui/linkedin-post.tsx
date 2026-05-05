"use client"

import Image from "next/image"
import { useState } from "react"

interface LinkedInPostProps {
  name?: string
  title?: string
  connectionDegree?: string
  timeAgo?: string
  content?: string
  imageUrl?: string
  reactionsCount?: number
  commentsCount?: number
  repostsCount?: number
  darkMode?: boolean
}

export function LinkedInPost({
  name = "Name Here",
  title = "Lorem ipsum",
  connectionDegree = "3rd+",
  timeAgo = "1min",
  content = "Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.",
  imageUrl,
  reactionsCount = 277,
  commentsCount = 18,
  repostsCount = 11,
  darkMode = false,
}: LinkedInPostProps) {
  const [isLiked, setIsLiked] = useState(false)

  const bgColor = darkMode ? "bg-[#1b1f23]" : "bg-white"
  const borderColor = darkMode ? "border-gray-700" : "border-gray-200"
  const textColor = darkMode ? "text-white" : "text-gray-900"
  const secondaryText = darkMode ? "text-gray-400" : "text-gray-500"
  const iconColor = darkMode ? "text-gray-400" : "text-gray-600"
  const hoverBg = darkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"
  const dividerColor = darkMode ? "border-gray-700" : "border-gray-100"

  return (
    <div className={`${bgColor} rounded-lg border ${borderColor} max-w-[550px] w-full shadow-sm`}>
      {/* Header */}
      <div className="flex items-start justify-between p-3 pb-2">
        <div className="flex gap-2">
          {/* Profile Picture */}
          <div className="w-12 h-12 rounded-full bg-[#0a66c2] shrink-0" />
          
          {/* User Info */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className={`font-semibold text-sm ${textColor}`}>{name}</span>
              <span className={`${secondaryText} text-sm`}>· {connectionDegree}</span>
            </div>
            <span className={`text-xs ${secondaryText}`}>{title}</span>
            <div className={`flex items-center gap-1 text-xs ${secondaryText}`}>
              <span>{timeAgo}</span>
              <span>·</span>
              {/* Globe Icon */}
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 107 7 7 7 0 00-7-7zM3 8a5 5 0 011.1-3.14 8.93 8.93 0 00-.14 1.46A12.2 12.2 0 005.14 12 5 5 0 013 8zm5 5a4.83 4.83 0 01-1.36-.2A10.67 10.67 0 015.18 8a10.67 10.67 0 011.46-4.8A4.83 4.83 0 018 3a4.83 4.83 0 011.36.2A10.67 10.67 0 0110.82 8a10.67 10.67 0 01-1.46 4.8A4.83 4.83 0 018 13zm2.86-1A12.2 12.2 0 0012 6.32a8.93 8.93 0 00-.14-1.46A5 5 0 0113 8a5 5 0 01-2.14 4z"/>
              </svg>
            </div>
          </div>
        </div>
        
        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button className={`text-[#0a66c2] font-semibold text-sm ${darkMode ? 'hover:bg-blue-900/30' : 'hover:bg-blue-50'} px-2 py-1 rounded flex items-center gap-1`}>
            <span className="text-lg leading-none">+</span> Follow
          </button>
          <button className={`p-1 ${hoverBg} rounded`}>
            <svg className={`w-5 h-5 ${iconColor}`} viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content Text */}
      <div className="px-3 pb-3">
        <p className={`text-sm ${textColor} leading-relaxed`}>{content}</p>
      </div>

      {/* Image Placeholder */}
      <div className={`relative w-full aspect-4/3 ${darkMode ? 'bg-gray-700' : 'bg-gray-300'} flex items-center justify-center overflow-hidden`}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`${name} post image`}
            fill
            sizes="(max-width: 550px) 100vw, 550px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <svg className={`w-16 h-16 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21,15 16,10 5,21"/>
          </svg>
        )}
      </div>

      {/* Reactions Bar */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${dividerColor}`}>
        <div className="flex items-center gap-1">
          {/* Reaction Icons */}
          <div className="flex -space-x-1">
            <div className="w-4 h-4 rounded-full bg-[#0a66c2] flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 14s-5.5-3.5-5.5-7A3.5 3.5 0 018 4.5 3.5 3.5 0 0113.5 7c0 3.5-5.5 7-5.5 7z"/>
              </svg>
            </div>
            <div className="w-4 h-4 rounded-full bg-[#44712e] flex items-center justify-center">
              <span className="text-[8px]">👏</span>
            </div>
            <div className="w-4 h-4 rounded-full bg-[#df704d] flex items-center justify-center">
              <span className="text-[8px]">❤️</span>
            </div>
          </div>
          <span className={`text-xs ${secondaryText} ml-1`}>{reactionsCount}</span>
        </div>
        
        <div className={`flex items-center gap-2 text-xs ${secondaryText}`}>
          <span>{commentsCount} comments</span>
          <span>·</span>
          <span>{repostsCount} reposts</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-around py-1">
        <button 
          onClick={() => setIsLiked(!isLiked)}
          className={`flex items-center gap-2 px-4 py-3 ${hoverBg} rounded transition-colors ${isLiked ? 'text-[#0a66c2]' : iconColor}`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
            <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
          </svg>
          <span className="text-sm font-medium">Like</span>
        </button>
        
        <button className={`flex items-center gap-2 px-4 py-3 ${hoverBg} rounded ${iconColor} transition-colors`}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/>
          </svg>
          <span className="text-sm font-medium">Comment</span>
        </button>
        
        <button className={`flex items-center gap-2 px-4 py-3 ${hoverBg} rounded ${iconColor} transition-colors`}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 1l4 4-4 4"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <path d="M7 23l-4-4 4-4"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
          <span className="text-sm font-medium">Repost</span>
        </button>
        
        <button className={`flex items-center gap-2 px-4 py-3 ${hoverBg} rounded ${iconColor} transition-colors`}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          <span className="text-sm font-medium">Send</span>
        </button>
      </div>
    </div>
  )
}
