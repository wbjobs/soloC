<script lang="ts">
	import { onMount } from 'svelte';

	interface AlertRule {
		id: string;
		name: string;
		query: string;
		database_type: string;
		threshold: number;
		threshold_type: string;
		level: string;
		duration: string;
		enabled: boolean;
		created_at: string;
	}

	let rules: AlertRule[] = [];
	let loading = false;
	let error = '';
	let showForm = false;

	let formData = {
		name: '',
		query: '',
		database_type: 'prometheus',
		threshold: 80,
		threshold_type: 'above',
		level: 'warning',
		duration: '5m'
	};

	async function loadRules() {
		try {
			const response = await fetch('http://localhost:8080/api/alerts/rules');
			if (response.ok) {
				rules = await response.json();
			}
		} catch (e) {
			console.error('Failed to load rules');
		}
	}

	async function createRule() {
		loading = true;
		error = '';
		try {
			const response = await fetch('http://localhost:8080/api/alerts/rules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});

			if (response.ok) {
				showForm = false;
				formData = {
					name: '',
					query: '',
					database_type: 'prometheus',
					threshold: 80,
					threshold_type: 'above',
					level: 'warning',
					duration: '5m'
				};
				await loadRules();
			} else {
				error = '创建规则失败';
			}
		} catch (e) {
			error = '创建规则失败，请确保后端服务已启动';
		} finally {
			loading = false;
		}
	}

	async function toggleRule(rule: AlertRule) {
		try {
			await fetch(`http://localhost:8080/api/alerts/rules/${rule.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: !rule.enabled })
			});
			await loadRules();
		} catch (e) {
			console.error('Failed to toggle rule');
		}
	}

	async function deleteRule(id: string) {
		if (!confirm('确定要删除这条规则吗？')) return;
		
		try {
			await fetch(`http://localhost:8080/api/alerts/rules/${id}`, {
				method: 'DELETE'
			});
			await loadRules();
		} catch (e) {
			console.error('Failed to delete rule');
		}
	}

	onMount(() => {
		loadRules();
	});
</script>

<div class="card">
	<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
		<h1 class="card-title" style="margin: 0;">告警规则管理</h1>
		<button class="btn btn-primary" on:click={() => showForm = !showForm}>
			{showForm ? '取消' : '+ 添加规则'}
		</button>
	</div>

	{#if showForm}
		<div style="border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1.5rem;">
			<h3 style="margin-bottom: 1rem;">创建告警规则</h3>
			
			<div class="form-group">
				<label class="form-label">规则名称</label>
				<input
					bind:value={formData.name}
					type="text"
					class="form-input"
					placeholder="例如: CPU 使用率过高"
				/>
			</div>

			<div class="form-group">
				<label class="form-label">查询语句</label>
				<textarea
					bind:value={formData.query}
					class="form-textarea"
					placeholder="例如: cpu_usage{host='server1'}[5m]"
				/>
			</div>

			<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
				<div class="form-group">
					<label class="form-label">数据库类型</label>
					<select bind:value={formData.database_type} class="form-select">
						<option value="prometheus">Prometheus</option>
						<option value="influxdb">InfluxDB</option>
						<option value="timescaledb">TimescaleDB</option>
					</select>
				</div>

				<div class="form-group">
					<label class="form-label">告警级别</label>
					<select bind:value={formData.level} class="form-select">
						<option value="info">Info</option>
						<option value="warning">Warning</option>
						<option value="critical">Critical</option>
					</select>
				</div>
			</div>

			<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
				<div class="form-group">
					<label class="form-label">阈值</label>
					<input
						bind:value={formData.threshold}
						type="number"
						class="form-input"
					/>
				</div>

				<div class="form-group">
					<label class="form-label">条件</label>
					<select bind:value={formData.threshold_type} class="form-select">
						<option value="above">大于</option>
						<option value="below">小于</option>
						<option value="equal">等于</option>
						<option value="not_equal">不等于</option>
					</select>
				</div>

				<div class="form-group">
					<label class="form-label">持续时间</label>
					<input
						bind:value={formData.duration}
						type="text"
						class="form-input"
						placeholder="5m"
					/>
				</div>
			</div>

			{#if error}
				<p style="color: var(--danger-color); margin-bottom: 1rem;">{error}</p>
			{/if}

			<button
				class="btn btn-primary"
				on:click={createRule}
				disabled={loading || !formData.name || !formData.query}
			>
				{loading ? '创建中...' : '创建规则'}
			</button>
		</div>
	{/if}

	{#if rules.length === 0}
		<div class="empty-state">
			<h3>暂无告警规则</h3>
			<p>点击上方按钮创建第一条告警规则</p>
		</div>
	{:else}
		{#each rules as rule}
			<div class="rule-item">
				<div>
					<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
						<strong>{rule.name}</strong>
						<span class="badge badge-{rule.level}">{rule.level.toUpperCase()}</span>
					</div>
					<p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.5rem;">
						{rule.query}
					</p>
					<p style="font-size: 0.875rem;">
						阈值: {rule.threshold_type === 'above' ? '>' : rule.threshold_type === 'below' ? '<' : '='} {rule.threshold}
						{#if rule.duration}
							| 持续: {rule.duration}
						{/if}
						| 数据库: {rule.database_type}
					</p>
				</div>
				<div class="rule-actions">
					<label class="switch">
						<input
							type="checkbox"
							checked={rule.enabled}
							on:change={() => toggleRule(rule)}
						/>
						<span class="slider"></span>
					</label>
					<button class="btn btn-sm btn-danger" on:click={() => deleteRule(rule.id)}>
						删除
					</button>
				</div>
			</div>
		{/each}
	{/if}
</div>
