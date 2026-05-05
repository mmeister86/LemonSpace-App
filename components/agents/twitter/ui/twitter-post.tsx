"use client"

import Image from "next/image"
import { MessageCircle, Repeat2, Heart, Bookmark, Share } from "lucide-react"

interface TwitterPostProps {
  name?: string
  handle?: string
  isVerified?: boolean
  content?: string
  hashtags?: string[]
  imageUrl?: string
  timestamp?: string
  date?: string
  views?: string
  retweets?: string
  quotes?: string
  likes?: string
  bookmarks?: string
  isLiked?: boolean
  darkMode?: boolean
}

export function TwitterPost({
  name = "Your Name",
  handle = "@UserNameHere",
  isVerified = true,
  content = "Lorem ipsum dolor sit amet, consectetur adiisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  hashtags = ["#template"],
  imageUrl,
  timestamp = "11:30 PM",
  date = "21/03/2030",
  views = "987K",
  retweets = "82k",
  quotes = "45k",
  likes = "91k",
  bookmarks = "78k",
  isLiked = true,
  darkMode = false,
}: TwitterPostProps) {
  const bgColor = darkMode ? "bg-black" : "bg-white"
  const textColor = darkMode ? "text-white" : "text-gray-900"
  const secondaryText = darkMode ? "text-gray-500" : "text-gray-500"
  const borderColor = darkMode ? "border-gray-800" : "border-gray-200"
  const iconColor = darkMode ? "text-gray-500" : "text-gray-600"

  return (
    <div className={`${bgColor} ${textColor} max-w-[550px] p-4 rounded-none`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          {/* Profile Picture */}
          <div className="w-12 h-12 rounded-full bg-blue-500 shrink-0" />

          {/* Name and Handle */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="font-bold text-[15px]">{name}</span>
              {isVerified && (
                <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                </svg>
              )}
            </div>
            <span className={`${secondaryText} text-[15px]`}>{handle}</span>
          </div>
        </div>

        {/* More Options */}
        <button className={`${iconColor} hover:text-blue-500`}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="mt-3 text-[15px] leading-normal">
        <p>
          {content}{" "}
          {hashtags.map((tag, index) => (
            <span key={index} className="text-blue-500">
              {tag}{" "}
            </span>
          ))}
        </p>
      </div>

      {/* Image Placeholder */}
      <div className="relative mt-3 aspect-16/10 bg-gray-300 rounded-2xl flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`${name} post image`}
            fill
            sizes="(max-width: 550px) 100vw, 550px"
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>

      {/* Timestamp and Views */}
      <div className={`mt-3 flex items-center gap-1 text-[15px] ${secondaryText}`}>
        <span>{timestamp}</span>
        <span>·</span>
        <span>{date}</span>
        <span>·</span>
        <span className={textColor}><strong>{views}</strong></span>
        <span>Views</span>
      </div>

      {/* Stats Row */}
      <div className={`mt-3 py-3 border-t border-b ${borderColor} flex items-center gap-6 text-[15px]`}>
        <div>
          <span className={`font-bold ${textColor}`}>{retweets}</span>{" "}
          <span className={secondaryText}>Retweets</span>
        </div>
        <div>
          <span className={`font-bold ${textColor}`}>{quotes}</span>{" "}
          <span className={secondaryText}>Quotes</span>
        </div>
        <div>
          <span className={`font-bold ${textColor}`}>{likes}</span>{" "}
          <span className={secondaryText}>Likes</span>
        </div>
        <div>
          <span className={`font-bold ${textColor}`}>{bookmarks}</span>{" "}
          <span className={secondaryText}>Bookmarks</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={`mt-2 flex items-center justify-around ${iconColor}`}>
        <button className="p-2 hover:text-blue-500 hover:bg-blue-500/10 rounded-full transition-colors">
          <MessageCircle className="w-[22px] h-[22px]" />
        </button>
        <button className="p-2 hover:text-green-500 hover:bg-green-500/10 rounded-full transition-colors">
          <Repeat2 className="w-[22px] h-[22px]" />
        </button>
        <button className={`p-2 rounded-full transition-colors ${isLiked ? "text-red-500" : "hover:text-red-500 hover:bg-red-500/10"}`}>
          <Heart className="w-[22px] h-[22px]" fill={isLiked ? "currentColor" : "none"} />
        </button>
        <button className="p-2 hover:text-blue-500 hover:bg-blue-500/10 rounded-full transition-colors">
          <Bookmark className="w-[22px] h-[22px]" />
        </button>
        <button className="p-2 hover:text-blue-500 hover:bg-blue-500/10 rounded-full transition-colors">
          <Share className="w-[22px] h-[22px]" />
        </button>
      </div>
    </div>
  )
}
