<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Chart, registerables } from 'chart.js';
	import 'chartjs-adapter-date-fns';

	Chart.register(...registerables);

	let query = 'cpu_usage{host="server1"}[30m]';
	let databaseType = 'prometheus';
	let loading = false;
	let error = '';
	let chartCanvas: HTMLCanvasElement;
	let chart: Chart | null = null;
	let result: any = null;

	async function executeQuery() {
		loading = true;
		error = '';
		try {
			const response = await fetch('http://localhost:8080/api/mock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, database_type: databaseType })
			});
			
			if (!response.ok) {
				throw new Error('Query failed');
			}
			
			result = await response.json();
			renderChart(result);
		} catch (e) {
			error = '查询执行失败，请确保后端服务已启动';
			console.error(e);
		} finally {
			loading = false;
		}
	}

	function renderChart(data: any) {
		if (chart) {
			chart.destroy();
		}

		const datasets = data.series.map((series: any, index: number) => {
			const colors = [
				'3b82f6', 'ef4444', '22c55e', 'f59e0b', '06b6d4',
				'8b5cf6', 'ec4899', '10b981'
			];
			const color = colors[index % colors.length];
			
			return {
				label: series.name,
				data: series.points.map((p: [string, number]) => ({
					x: new Date(p[0]),
					y: p[1]
				})),
				borderColor: `#${color}`,
				backgroundColor: `#${color}20`,
				fill: true,
				tension: 0.4
			};
		});

		chart = new Chart(chartCanvas, {
			type: 'line',
			data: { datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'index',
					intersect: false
				},
				scales: {
					x: {
						type: 'time',
						time: {
							unit: 'minute',
							displayFormats: {
								minute: 'HH:mm'
							}
						},
						title: {
							display: true,
							text: '时间'
						}
					},
					y: {
						beginAtZero: true,
						title: {
							display: true,
							text: '值'
						}
					}
				}
			}
		});
	}

	onMount(() => {
		executeQuery();
	});

	onDestroy(() => {
		if (chart) {
			chart.destroy();
		}
	});
</script>

<div class="card">
	<h1 class="card-title">时序数据查询</h1>
	
	<div class="form-group">
		<label class="form-label">查询语句 (类 PromQL 语法)</label>
		<textarea
			bind:value={query}
			class="form-textarea"
			placeholder="例如: cpu_usage{host='server1'}[30m]"
		/>
	</div>

	<div class="query-row">
		<div class="form-group" style="margin-bottom: 0;">
			<label class="form-label">数据库类型</label>
			<select bind:value={databaseType} class="form-select">
				<option value="prometheus">Prometheus</option>
				<option value="influxdb">InfluxDB</option>
				<option value="timescaledb">TimescaleDB</option>
			</select>
		</div>

		<button
			class="btn btn-primary"
			on:click={executeQuery}
			disabled={loading || !query.trim()}
		>
			{loading ? '查询中...' : '执行查询'}
		</button>
	</div>

	{#if error}
		<p style="color: var(--danger-color); margin-top: 1rem;">{error}</p>
	{/if}
</div>

{#if result}
	<div class="card">
		<h2 class="card-title">查询结果</h2>
		<div class="chart-container">
			<canvas bind:this={chartCanvas} />
		</div>
	</div>
{/if}
