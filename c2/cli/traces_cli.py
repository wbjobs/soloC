import click
from tabulate import tabulate
import sys
from datetime import datetime


from app.storage.influxdb import get_influx_storage
from app.config import settings


@click.group()
def cli():
    pass


@cli.command()
@click.option("--service", "-s", required=True, help="服务名称")
@click.option("--limit", "-l", default=100, help="返回的最大数量")
@click.option("--threshold", "-t", default=None, type=int, help="慢调用阈值(毫秒)，默认500ms")
@click.option("--time-range", "-r", default="24h", help="查询时间范围，如 24h, 7d")
def fetch_traces(service, limit, threshold, time_range):
    """获取指定服务的慢调用列表"""
    if threshold is None:
        threshold = settings.SLOW_CALL_THRESHOLD_MS
    
    try:
        storage = get_influx_storage()
        spans = storage.query_slow_calls(
            service_name=service,
            threshold_ms=threshold,
            limit=limit,
            time_range=f"-{time_range}"
        )
        
        if not spans:
            click.echo(f"未找到服务 '{service}' 的慢调用（阈值: {threshold}ms）")
            return
        
        table_data = []
        for span in spans:
            table_data.append([
                span["timestamp"],
                span["operation"],
                f"{span['duration']}ms",
                span["parent_span_id"] or "-",
                str(span.get("metadata", {}))
            ])
        
        headers = ["时间", "操作", "耗时", "父Span ID", "元数据"]
        
        click.echo(f"\n服务 '{service}' 的慢调用列表（阈值: {threshold}ms，共 {len(spans)} 条）:\n")
        click.echo(tabulate(table_data, headers=headers, tablefmt="grid"))
        
    except Exception as e:
        click.echo(f"查询失败: {str(e)}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    cli()
