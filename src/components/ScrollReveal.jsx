import { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import './ScrollReveal.css';

gsap.registerPlugin(ScrollTrigger);

const ScrollReveal = ({
  as: Container = 'h2',
  children,
  scrollContainerRef,
  triggerRef,
  enableBlur = true,
  baseOpacity = 0.1,
  baseRotation = 3,
  blurStrength = 4,
  containerClassName = '',
  textClassName = '',
  textAs: Text = 'p',
  rotationStart = 'top bottom',
  rotationEnd = 'bottom bottom',
  wordAnimationStart = 'top bottom-=20%',
  wordAnimationEnd = 'bottom bottom',
  ...containerProps
}) => {
  const containerRef = useRef(null);

  const splitText = useMemo(() => {
    const text = typeof children === 'string' ? children : '';
    return text.split(/(\s+)/).map((word, index) => {
      if (word.match(/^\s+$/)) return word;
      return (
        <span className="word" key={index}>
          {word}
        </span>
      );
    });
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scroller = scrollContainerRef && scrollContainerRef.current ? scrollContainerRef.current : window;
    const trigger = triggerRef && triggerRef.current ? triggerRef.current : el;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { transformOrigin: '0% 50%', rotate: baseRotation },
        {
          ease: 'none',
          rotate: 0,
          scrollTrigger: {
            trigger,
            scroller,
            start: rotationStart,
            end: rotationEnd,
            scrub: true
          }
        }
      );

      const wordElements = el.querySelectorAll('.word');

      gsap.fromTo(
        wordElements,
        { opacity: baseOpacity, y: '0.32em', willChange: 'opacity, transform' },
        {
          ease: 'none',
          opacity: 1,
          y: 0,
          stagger: 0.05,
          scrollTrigger: {
            trigger,
            scroller,
            start: wordAnimationStart,
            end: wordAnimationEnd,
            scrub: true
          }
        }
      );

      if (enableBlur) {
        gsap.fromTo(
          wordElements,
          { filter: `blur(${blurStrength}px)` },
          {
            ease: 'none',
            filter: 'blur(0px)',
            stagger: 0.05,
            scrollTrigger: {
              trigger,
              scroller,
              start: wordAnimationStart,
              end: wordAnimationEnd,
              scrub: true
            }
          }
        );
      }
    }, el);

    return () => {
      ctx.revert();
    };
  }, [
    scrollContainerRef,
    triggerRef,
    enableBlur,
    baseRotation,
    baseOpacity,
    rotationStart,
    rotationEnd,
    wordAnimationStart,
    wordAnimationEnd,
    blurStrength
  ]);

  return (
    <Container
      ref={containerRef}
      className={`scroll-reveal ${containerClassName}`}
      {...containerProps}
    >
      <Text className={`scroll-reveal-text ${textClassName}`}>{splitText}</Text>
    </Container>
  );
};

export default ScrollReveal;
