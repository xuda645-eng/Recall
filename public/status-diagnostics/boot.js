const requestedCase = new URLSearchParams(location.search).get('status-case');
document.documentElement.dataset.case = ['a', 'b', 'c'].includes(requestedCase) ? requestedCase : 'a';
