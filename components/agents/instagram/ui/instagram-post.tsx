"use client"

/**
 * Onboarding note:
 * Agent documentation/runtime support module for instagram post. Keep Markdown prompt segments and TypeScript contracts synchronized.
 */

import Image from "next/image"
import { Heart, MessageCircle, Send, Bookmark, MoreVertical } from "lucide-react"
import type { ReactNode } from "react"

interface InstagramPostProps {
  username?: string
  location?: string
  profileImageUrl?: string
  imageUrl?: string
  imageSlot?: ReactNode
  imageAspectRatio?: "square" | "portrait-4-5"
  imageAlt?: string
  isLiked?: boolean
  likesCount?: number
  caption?: string
  hashtags?: string[]
}

function safeImageSrc(value: string | undefined): string | undefined {
  const src = value?.trim()
  if (!src) {
    return undefined
  }

  if (/^(https?:\/\/|data:image\/|blob:)/i.test(src)) {
    return src
  }

  if (src.startsWith("/") && !src.startsWith("/canvas/")) {
    return src
  }

  return undefined
}

export function InstagramPost({
  username = "paula_johnson83",
  location = "Altadena, California",
  profileImageUrl,
  imageUrl,
  imageSlot,
  imageAspectRatio = "square",
  imageAlt,
  isLiked = true,
  likesCount = 532,
  caption = "lorem ipsum dolor sit amet",
  hashtags = ["#augue", "#adipiscing", "#elit", "#do", "#eiusmod", "#tempor"],
}: InstagramPostProps) {
  const safeProfileImageUrl = safeImageSrc(profileImageUrl)
  const safePostImageUrl = safeImageSrc(imageUrl)
  const imageAreaAspectClass =
    imageAspectRatio === "portrait-4-5" ? "aspect-[4/5]" : "aspect-square"

  return (
    <div className="w-full bg-white border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          {/* Profile Picture with Gradient Ring */}
          <div className="w-11 h-11 rounded-full p-[2px] bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-600">
            <div className="w-full h-full rounded-full bg-white p-[2px]">
              <div className="relative w-full h-full rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                {safeProfileImageUrl ? (
                  <Image
                    src={safeProfileImageUrl}
                    alt={username}
                    fill
                    sizes="44px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <svg className="w-6 h-6 text-gray-400 mt-1" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Username & Location */}
          <div className="flex flex-col">
            <span className="font-semibold text-sm text-gray-900">{username}</span>
            <span className="text-xs text-gray-500">{location}</span>
          </div>
        </div>

        {/* More Options */}
        <button className="p-1">
          <MoreVertical className="w-5 h-5 text-gray-900" />
        </button>
      </div>

      {/* Image Area - Checkered Pattern Placeholder */}
      <div
        data-testid="instagram-post-image-area"
        className={`relative ${imageAreaAspectClass} overflow-hidden`}
      >
        {imageSlot ? (
          imageSlot
        ) : safePostImageUrl ? (
          <Image
            src={safePostImageUrl}
            alt={imageAlt ?? `${username} post`}
            fill
            sizes="100vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `
                linear-gradient(45deg, #ccc 25%, transparent 25%),
                linear-gradient(-45deg, #ccc 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #ccc 75%),
                linear-gradient(-45deg, transparent 75%, #ccc 75%)
              `,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              backgroundColor: '#fff'
            }}
          />
        )}
      </div>

      {/* Action Bar */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Like Button */}
            <button className="p-0">
              <Heart
                className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-900'}`}
              />
            </button>

            {/* Comment Button */}
            <button className="p-0">
              <MessageCircle className="w-6 h-6 text-gray-900 scale-x-[-1]" />
            </button>

            {/* Share Button */}
            <button className="p-0">
              <Send className="w-6 h-6 text-gray-900" />
            </button>
          </div>

          {/* Bookmark Button */}
          <button className="p-0">
            <Bookmark className="w-6 h-6 text-gray-900" />
          </button>
        </div>

        {/* Likes Count */}
        <div className="flex items-center gap-1 mt-2">
          <Heart className="w-3 h-3 fill-gray-900 text-gray-900" />
          <span className="text-sm font-semibold text-gray-900">{likesCount.toLocaleString()} Likes</span>
        </div>

        {/* Caption */}
        <div className="mt-1">
          <span className="text-sm">
            <span className="font-semibold text-gray-900">{username}</span>{" "}
            <span className="text-gray-900">{caption}</span>
          </span>
        </div>

        {/* Hashtags */}
        {hashtags && hashtags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-1">
            {hashtags.map((tag, index) => (
              <a
                key={index}
                href="#"
                className="text-sm text-blue-900 hover:underline"
              >
                {tag}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
