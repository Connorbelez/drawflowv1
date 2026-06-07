import { useEffect, useId, useState, type RefObject } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "#/lib/utils.ts"

export interface AnimatedBeamProps {
  className?: string
  containerRef: RefObject<HTMLElement | null> // Container ref
  fromRef: RefObject<HTMLElement | null>
  toRef: RefObject<HTMLElement | null>
  variant?: "default" | "blueprint"
  curvature?: number
  reverse?: boolean
  pathColor?: string
  pathWidth?: number
  pathOpacity?: number
  pathDasharray?: string
  basePathClassName?: string
  beamClassName?: string
  gradientStartColor?: string
  gradientStopColor?: string
  delay?: number
  duration?: number
  repeat?: number
  repeatDelay?: number
  startXOffset?: number
  startYOffset?: number
  endXOffset?: number
  endYOffset?: number
}

export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  className,
  containerRef,
  fromRef,
  toRef,
  variant = "default",
  curvature = 0,
  reverse = false, // Include the reverse prop
  duration = 5,
  delay = 0,
  pathColor,
  pathWidth = 2,
  pathOpacity = 0.2,
  pathDasharray,
  basePathClassName,
  beamClassName,
  gradientStartColor,
  gradientStopColor,
  repeat = Infinity,
  repeatDelay = 0,
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}) => {
  const id = useId()
  const shouldReduceMotion = useReducedMotion()
  const [pathD, setPathD] = useState("")
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 })
  const isBlueprint = variant === "blueprint"
  const basePathColor =
    pathColor ?? (isBlueprint ? "oklch(0.4 0.12 240 / 0.46)" : "gray")
  const activeStartColor =
    gradientStartColor ?? (isBlueprint ? "oklch(0.45 0.2 145)" : "#ffaa40")
  const activeStopColor =
    gradientStopColor ?? (isBlueprint ? "oklch(0.52 0.16 176)" : "#9c40ff")

  // Calculate the gradient coordinates based on the reverse prop
  const gradientCoordinates = reverse
    ? {
        x1: ["90%", "-10%"],
        x2: ["100%", "0%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      }
    : {
        x1: ["10%", "110%"],
        x2: ["0%", "100%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      }

  useEffect(() => {
    let animationFrame = 0
    let attempts = 0

    const updatePath = () => {
      if (!containerRef.current || !fromRef.current || !toRef.current) {
        return false
      }

      const containerRect = containerRef.current.getBoundingClientRect()
      const rectA = fromRef.current.getBoundingClientRect()
      const rectB = toRef.current.getBoundingClientRect()
      const svgWidth = containerRect.width
      const svgHeight = containerRect.height

      if (svgWidth <= 0 || svgHeight <= 0 || rectA.width <= 0 || rectB.width <= 0) {
        return false
      }

      setSvgDimensions({ width: svgWidth, height: svgHeight })

      const startX =
        rectA.left - containerRect.left + rectA.width / 2 + startXOffset
      const startY =
        rectA.top - containerRect.top + rectA.height / 2 + startYOffset
      const endX =
        rectB.left - containerRect.left + rectB.width / 2 + endXOffset
      const endY =
        rectB.top - containerRect.top + rectB.height / 2 + endYOffset

      const controlY = startY - curvature
      const d = `M ${startX},${startY} Q ${
        (startX + endX) / 2
      },${controlY} ${endX},${endY}`
      setPathD(d)
      return true
    }

    const scheduleUpdatePath = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        const didUpdate = updatePath()
        if (!didUpdate && attempts < 60) {
          attempts += 1
          scheduleUpdatePath()
        }
      })
    }

    // Initialize ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      scheduleUpdatePath()
    })

    // Observe the container element
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    if (fromRef.current) {
      resizeObserver.observe(fromRef.current)
    }

    if (toRef.current) {
      resizeObserver.observe(toRef.current)
    }

    window.addEventListener("resize", scheduleUpdatePath)

    // Call the updatePath initially to set the initial path
    scheduleUpdatePath()

    // Clean up the observer on component unmount
    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      window.removeEventListener("resize", scheduleUpdatePath)
    }
  }, [
    containerRef,
    fromRef,
    toRef,
    curvature,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
  ])

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "pointer-events-none absolute top-0 left-0 transform-gpu stroke-2",
        className
      )}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
    >
      <path
        d={pathD}
        className={cn(isBlueprint && "animated-beam-blueprint-base", basePathClassName)}
        stroke={basePathColor}
        strokeDasharray={pathDasharray}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />
      <path
        d={pathD}
        className={cn(isBlueprint && "animated-beam-blueprint-active", beamClassName)}
        strokeDasharray={pathDasharray}
        strokeWidth={pathWidth}
        stroke={`url(#${id})`}
        strokeOpacity="1"
        strokeLinecap="round"
      />
      <defs>
        <motion.linearGradient
          className="transform-gpu"
          id={id}
          gradientUnits={"userSpaceOnUse"}
          initial={
            shouldReduceMotion
              ? {
                  x1: "0%",
                  x2: "100%",
                  y1: "0%",
                  y2: "0%",
                }
              : {
                  x1: "0%",
                  x2: "0%",
                  y1: "0%",
                  y2: "0%",
                }
          }
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  x1: gradientCoordinates.x1,
                  x2: gradientCoordinates.x2,
                  y1: gradientCoordinates.y1,
                  y2: gradientCoordinates.y2,
                }
          }
          transition={{
            delay,
            duration,
            ease: [0.16, 1, 0.3, 1], // https://easings.net/#easeOutExpo
            repeat,
            repeatDelay,
          }}
        >
          <stop stopColor={activeStartColor} stopOpacity="0"></stop>
          <stop stopColor={activeStartColor}></stop>
          <stop offset="32.5%" stopColor={activeStopColor}></stop>
          <stop
            offset="100%"
            stopColor={activeStopColor}
            stopOpacity="0"
          ></stop>
        </motion.linearGradient>
      </defs>
    </svg>
  )
}
