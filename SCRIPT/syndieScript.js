const introSound = new Audio("./Soundfiles/traitor_start.ogg");
introSound.play();

// Inject styles
const style = document.createElement('style');
style.textContent = `
  @keyframes hack-in {
    0% {
      opacity: 0;
      transform: translateY(20px);
      filter: blur(4px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }

  .hack-effect {
    opacity: 0;
    will-change: opacity, transform, filter;
  }

  .hack-visible {
    animation: hack-in 1.6s ease-out forwards;
  }
`;
document.head.appendChild(style);

// Characters used for scrambling
const chars = ".- ";

// Utility: scramble text with random chars of same length
function scrambleText(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Scramble effect: replaces text gradually with original text
function scrambleReveal(element, originalText, duration = 2000) {
    const intervalTime = 30; // ms between updates
    const totalFrames = Math.floor(duration / intervalTime);
    let frame = 0;

    const revealInterval = setInterval(() => {
        let output = '';
        for (let i = 0; i < originalText.length; i++) {
            if (i < (frame / totalFrames) * originalText.length) {
                output += originalText[i]; // reveal correct char
            } else if (originalText[i] === ' ') {
                output += ' '; // preserve spaces
            } else {
                output += chars.charAt(Math.floor(Math.random() * chars.length)); // scramble
            }
        }
        element.textContent = output;
        frame++;
        if (frame > totalFrames) {
            clearInterval(revealInterval);
            element.textContent = originalText; // final fix
        }
    }, intervalTime);
}

// Wrap text nodes in spans with hack-effect class
function wrapTextNodes() {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    const nodesToWrap = [];

    while (node = walker.nextNode()) {
        if (node.nodeValue.trim()) {
            nodesToWrap.push(node);
        }
    }

    nodesToWrap.forEach(node => {
        const span = document.createElement('span');
        span.className = 'hack-effect';
        node.parentNode.replaceChild(span, node);
        span.appendChild(node);
    });
}

// Observe and reveal elements progressively with scramble
function observeHackEffects() {    
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;

                // Add fade/blur/translate animation
                el.classList.add('hack-visible');

                // Start scramble effect after fade animation starts
                const originalText = el.textContent;
                el.textContent = scrambleText(originalText.length);

                scrambleReveal(el, originalText);

                observer.unobserve(el);
            }
        });
    }, {
        threshold: 0.1
    });

    // Observe all hack-effect elements
    const all = document.querySelectorAll('.hack-effect');
    all.forEach(el => observer.observe(el));
}

// Run everything
wrapTextNodes();
observeHackEffects();
