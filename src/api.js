export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const check = request.headers['referer'] || 'yousayaido.com';
		if (request.headers['postman-token'] || check.indexOf('yousayaido.com') === -1) {
			return new Response('Bad Request', { status: 400 });
		}
		else if (url.pathname.startsWith('/api')) {
			if (request.method !== 'POST') return new Response('Bad Request', { status: 400 });
			return await connector(request, env.KV);
		} else if (url.pathname === '/') {
			if (request.method !== 'GET') return new Response('Bad Request', { status: 400 });
			return env.ASSETS.fetch(request);
		}
		return new Response('Bad Request', { status: 400 });
	},
};