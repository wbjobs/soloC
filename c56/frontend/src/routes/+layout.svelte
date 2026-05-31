<script lang="ts">
	import { page } from '$app/stores';
	import '../app.css';
</script>

<header class="header">
	<nav class="nav container">
		<a href="/" class:active={$page.url.pathname === '/'}>查询</a>
		<a href="/alerts" class:active={$page.url.pathname === '/alerts'}>告警规则</a>
		<a href="/history" class:active={$page.url.pathname === '/history'}>告警历史</a>
	</nav>
</header>

<main class="container">
	<slot />
</main>
