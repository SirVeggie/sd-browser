// See how the options work here: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
const options = {
    root: null,
    rootMargin: "0px",
    threshold: 0
};

export function lazyload(node: any, src: any) {
    const loaded = () => {
        //image.classList.add('visible')                          // doesn't work in REPL
        node.style.opacity = "1";                                 // REPL hack to apply loading animation
    };
    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
            console.log('an image has loaded');                  // console log for REPL
            node.src = src;                                     // replace placeholder src with the image src on observe
            if (node.complete) {                               // check if instantly loaded
                loaded();
            } else {
                node.addEventListener('load', loaded);          // if the image isn't loaded yet, add an event listener
            }
        }
    }, options);
    observer.observe(node);                                     // intersection observer

    return {
        destroy() {
            node.removeEventListener('load', loaded);           // clean up the event listener
        }
    };
}