export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const check = request.headers['referer'] || 'yousayaido.com';
		if (request.headers['postman-token'] || check.indexOf('yousayaido.com') === -1) {
			return new Response('Bad Request', { status: 400 });
		}
		else if (url.pathname.startsWith('/shared/')) {
			//console.log('Shared Request:', url.pathname, env.KV, env.HOSTING);
			return await hosting({ headers: request.headers, method: request.method, url: url.pathname.slice(8) }, env.HOSTING);
		} else if (url.pathname.startsWith('/api')) {
			if (request.method !== 'POST') return new Response('Bad Request', { status: 400 });
			//console.log('API Request:', url.pathname, env.KV, env.HOSTING);
			return await connector(request, env.KV, env.HOSTING);
		} else if (url.pathname === '/') {
			if (request.method !== 'GET') return new Response('Bad Request', { status: 400 });
			return env.ASSETS.fetch(request);
		}
		return new Response('Bad Request', { status: 400 });
	},
};