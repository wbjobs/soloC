<script lang="ts">
	import { onMount } from 'svelte';

	interface Alert {
		id: string;
		rule_id: string;
		rule_name: string;
		level: string;
		message: string;
		timestamp: string;
		value: number;
		threshold: number;
	}

	let alerts: Alert[] = [];

	async function loadAlerts() {
		try {
			const response = await fetch('http://localhost:8080/api/alerts?limit=50');
			if (response.ok) {
				alerts = await response.json();
			}
		} catch (e) {
			console.error('Failed to load alerts');
		}
	}

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleString('zh-CN');
	}

	onMount(() => {
		loadAlerts();
	});
</script>

<div class="card">
	<h1 class="card-title">告警历史</h1>

	{#if alerts.length === 0}
		<div class="empty-state">
			<h3>暂无告警记录</h3>
			<p>当有告警触发时，记录会显示在这里</p>
		</div>
	{:else}
		{#each alerts as alert}
			<div class="alert-item {alert.level}">
				<div style="display: flex; justify-content: space-between; align-items: start;">
					<div>
						<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
							<span class="badge badge-{alert.level}">{alert.level.toUpperCase()}</span>
							<strong>{alert.rule_name}</strong>
						</div>
						<p style="font-size: 0.875rem; color: var(--text-secondary);">{alert.message}</p>
						<p style="font-size: 0.875rem; margin-top: 0.25rem;">
							当前值: {alert.value} | 阈值: {alert.threshold}
						</p>
					</div>
					<small style="color: var(--text-secondary); white-space: nowrap;">
						{formatDate(alert.timestamp)}
					</small>
				</div>
			</div>
		{/each}
	{/if}
</div>
