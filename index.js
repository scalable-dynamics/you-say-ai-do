export default {
	fetch() {
		return new Response('You Say AI Do', {
			headers: {
				'content-type': 'text/plain',
			},
		});
	},
};