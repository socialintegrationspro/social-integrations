import { useEffect, type ReactNode } from 'react'
import { LazyMotion, MotionConfig, animate, domMax, m, useMotionValue, useReducedMotion, useTransform, type Transition, type Variants } from 'motion/react'

/** Fast ease-out for things that appear. */
export const easeOut = [0.22, 1, 0.36, 1] as const

/** Spring for a pill that slides to the active item. */
export const pillSpring: Transition = { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }

/** A parent that shows its children one after another. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
}

/** A child of `stagger`: it rises a little and fades in. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.36, ease: easeOut } },
}

/**
 * Motion for the whole app. Components use `m.*` so only the loaded features ship.
 * With "reduce motion" set in the system, Motion skips movement and keeps the fades.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: easeOut }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

/** A number that counts up to its value. It shows the value at once when motion is reduced. */
export function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion()
  const count = useMotionValue(reduce ? value : 0)
  const shown = useTransform(count, (v) => Math.round(v).toString())
  useEffect(() => {
    if (reduce) {
      count.set(value)
      return
    }
    const run = animate(count, value, { duration: 0.9, ease: easeOut })
    return () => run.stop()
  }, [value, reduce, count])
  return <m.span>{shown}</m.span>
}
