import { useEffect, useRef } from 'react'

interface ConfettiParticle {
  x: number
  y: number
  size: number
  color: string
  speedX: number
  speedY: number
  rotation: number
  rotationSpeed: number
  opacity: number
}

const CONFETTI_COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#ef4444', // Red
]

export function CanvasConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas dimensions
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Create particles
    const particles: ConfettiParticle[] = []
    const particleCount = 180

    // Spawn half from left bottom, half from right bottom shooting upwards and inwards
    for (let i = 0; i < particleCount; i++) {
      const isLeft = i % 2 === 0
      particles.push({
        x: isLeft ? 0 : canvas.width,
        y: canvas.height * 0.85,
        size: Math.random() * 8 + 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] || '#6366f1',
        speedX: isLeft
          ? Math.random() * 15 + 10 // shoot right
          : -Math.random() * 15 - 10, // shoot left
        speedY: -Math.random() * 20 - 15, // shoot up
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
      })
    }

    let animationId: number
    const gravity = 0.4
    const friction = 0.98

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let active = false

      particles.forEach((p) => {
        if (p.opacity <= 0 || p.y > canvas.height + 50) return

        active = true
        p.speedX *= friction
        p.speedY += gravity
        p.x += p.speedX
        p.y += p.speedY
        p.rotation += p.rotationSpeed

        // Slow fade out as it drops low
        if (p.y > canvas.height * 0.6) {
          p.opacity -= 0.015
        }

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, p.opacity)

        // Draw rectangle confetti pieces
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5)
        ctx.restore()
      })

      if (active) {
        animationId = requestAnimationFrame(render)
      }
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50 w-full h-full"
    />
  )
}
