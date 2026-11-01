const requestedCase = new URLSearchParams(location.search).get('status-case');
document.documentElement.dataset.case = document.documentElement.dataset.case === 'f' ? 'f' : ['a', 'b', 'c'].includes(requestedCase) ? requestedCase : 'a';
