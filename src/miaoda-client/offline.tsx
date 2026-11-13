import { mountRecallPwa } from './entry';

const element = document.getElementById('root');
if (!element) throw new Error('Missing Recall root');
mountRecallPwa(element);
