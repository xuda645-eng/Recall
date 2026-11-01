const requestedCase = new URLSearchParams(location.search).get('case');
document.documentElement.dataset.case = ['a', 'b', 'c'].includes(requestedCase) ? requestedCase : 'a';
document.documentElement.dataset.standalone = String(navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);
