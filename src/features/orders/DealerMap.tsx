"use client";

import { MapPinned } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DealerMapData } from "@/features/orders/map-queries";
import { formatCurrency } from "@/features/orders/utils";
import { cn } from "@/lib/utils";

type DealerMapProps = {
  data: DealerMapData;
  amapKey: string;
  amapSecurityCode?: string;
};

declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
  }
}

type AMapInstance = {
  addControl(control: unknown): void;
  destroy(): void;
};

type AMapMarker = {
  setMap(map: AMapInstance): void;
  on(event: string, handler: () => void): void;
};

type AMapOverlay = {
  setMap(map: AMapInstance): void;
};

type AMapInfoWindow = {
  open(map: AMapInstance, position: [number, number]): void;
};

type AMapHeatMap = {
  setDataSet(data: { data: Array<{ lng: number; lat: number; count: number }>; max: number }): void;
};

type AMapNamespace = {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapInstance;
  Scale?: new () => unknown;
  ToolBar?: new () => unknown;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  Circle: new (options: Record<string, unknown>) => AMapOverlay;
  InfoWindow: new (options: Record<string, unknown>) => AMapInfoWindow;
  HeatMap?: new (map: AMapInstance, options: Record<string, unknown>) => AMapHeatMap;
};

const AMAP_SCRIPT_ID = "amap-js-api-v2";
const AMAP_LOAD_ERROR_MESSAGE = "高德地图加载失败，已切换为本地坐标示意图。请检查 Key、安全密钥或域名白名单。";
const AMAP_INIT_ERROR_MESSAGE = "高德地图初始化失败，已切换为本地坐标示意图。";

type LoadState = "idle" | "loading" | "loaded" | "error";

function normalize(value: number, min: number, max: number) {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 80 + 10;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

export function DealerMap({ data, amapKey, amapSecurityCode }: DealerMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const bounds = useMemo(() => {
    const points = [
      ...data.dealers.map((dealer) => ({ latitude: dealer.latitude, longitude: dealer.longitude })),
      ...data.heatPoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    ];
    return {
      minLat: Math.min(...points.map((point) => point.latitude), 27.75),
      maxLat: Math.max(...points.map((point) => point.latitude), 27.9),
      minLng: Math.min(...points.map((point) => point.longitude), 112.88),
      maxLng: Math.max(...points.map((point) => point.longitude), 112.99),
    };
  }, [data.dealers, data.heatPoints]);

  useEffect(() => {
    if (!amapKey || !mapRef.current) {
      setLoadState("idle");
      setLoadError(null);
      return;
    }

    if (amapSecurityCode) {
      window._AMapSecurityConfig = { securityJsCode: amapSecurityCode };
    }

    if (window.AMap?.Map) {
      setLoadError(null);
      setLoadState("loaded");
      return;
    }

    setLoadState("loading");
    setLoadError(null);
    const existingScript = document.getElementById(AMAP_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");
    const markLoaded = () => {
      if (window.AMap?.Map) {
        script.dataset.amapStatus = "loaded";
        setLoadError(null);
        setLoadState("loaded");
        return;
      }

      script.dataset.amapStatus = "error";
      setLoadError(AMAP_LOAD_ERROR_MESSAGE);
      setLoadState("error");
    };
    const handleLoad = () => markLoaded();
    const handleError = () => {
      script.dataset.amapStatus = "error";
      setLoadError(AMAP_LOAD_ERROR_MESSAGE);
      setLoadState("error");
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (!existingScript) {
      script.id = AMAP_SCRIPT_ID;
      script.dataset.amapStatus = "loading";
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapKey)}&plugin=AMap.Scale,AMap.ToolBar,AMap.HeatMap`;
      script.async = true;
      document.head.appendChild(script);
    } else if (script.dataset.amapStatus === "loaded" || script.dataset.amapStatus === "error") {
      markLoaded();
    }

    const timeoutId = window.setTimeout(() => {
      if (!window.AMap?.Map) {
        script.dataset.amapStatus = "error";
        setLoadError(AMAP_LOAD_ERROR_MESSAGE);
        setLoadState("error");
      }
    }, 12000);

    return () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
  }, [amapKey, amapSecurityCode]);

  useEffect(() => {
    if (loadState !== "loaded" || !window.AMap || !mapRef.current) return;
    const AMap = window.AMap;
    const center: [number, number] = data.dealers[0] ? [data.dealers[0].longitude, data.dealers[0].latitude] : [112.944, 27.829];
    let map: AMapInstance | null = null;

    try {
      map = new AMap.Map(mapRef.current, { zoom: 12, center });
      if (AMap.Scale) map.addControl(new AMap.Scale());
      if (AMap.ToolBar) map.addControl(new AMap.ToolBar());

      for (const dealer of data.dealers) {
        const marker = new AMap.Marker({
          position: [dealer.longitude, dealer.latitude],
          title: dealer.name,
        });
        marker.setMap(map);
        const circle = new AMap.Circle({
          center: [dealer.longitude, dealer.latitude],
          radius: dealer.serviceRadius,
          strokeColor: dealer.isAccepting ? "#d8001b" : "#b45309",
          fillColor: dealer.isAccepting ? "#fecaca" : "#ffedd5",
          fillOpacity: 0.22,
        });
        circle.setMap(map);
        marker.on("click", () => {
          if (!map) return;
          const info = new AMap.InfoWindow({
            content: `<div style="padding:8px 6px"><strong>${escapeHtml(dealer.name)}</strong><br/>${escapeHtml(dealer.zone)}<br/>服务半径 ${dealer.serviceRadius}m</div>`,
          });
          info.open(map, [dealer.longitude, dealer.latitude]);
        });
      }

      if (AMap.HeatMap && data.heatPoints.length > 0) {
        const heatmap = new AMap.HeatMap(map, { radius: 24, opacity: [0, 0.75] });
        heatmap.setDataSet({
          data: data.heatPoints.map((point) => ({ lng: point.longitude, lat: point.latitude, count: Math.max(1, point.amount / 100) })),
          max: 20,
        });
      }
    } catch {
      map?.destroy();
      setLoadError(AMAP_INIT_ERROR_MESSAGE);
      setLoadState("error");
      return;
    }

    return () => {
      if (map) {
        map.destroy();
      }
    };
  }, [data.dealers, data.heatPoints, loadState]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">经销商</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{data.dealers.length}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">可接单</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{data.dealers.filter((dealer) => dealer.isAccepting).length}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">热力订单</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{data.heatPoints.length}</p>
        </div>
      </div>

      <section className="table-shell">
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--dashboard-line)" }}>
          <h2 className="font-semibold text-neutral-950">湘潭经销商地图</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {amapKey ? "已配置高德地图 Key，加载 JS API 2.0 展示经销商与热力订单。" : "当前未配置高德地图 Key，展示本地坐标示意图。"}
            {amapKey && !amapSecurityCode ? " 如使用新申请 Key，请同步配置安全密钥。" : null}
          </p>
          <p className="mt-2 text-xs text-orange-700">
            {loadState === "loaded" ? "当前为真实地图模式。" : "当前为暖色本地降级模式，调度数据仍来自系统数据库。"}
          </p>
        </div>
        <div className="relative h-[560px] bg-[var(--dashboard-control)]" ref={mapRef}>
          {loadState !== "loaded" ? (
            <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(90deg,rgba(232,111,81,0.16)_1px,transparent_1px),linear-gradient(rgba(232,111,81,0.12)_1px,transparent_1px)] bg-[size:48px_48px]">
              {loadState === "loading" ? <div className="absolute left-4 top-4 rounded-md border bg-[var(--dashboard-panel)] px-3 py-2 text-sm text-orange-700 shadow-[var(--surface-raised-shadow)]" style={{ borderColor: "var(--dashboard-line)" }}>正在加载高德地图...</div> : null}
              {loadState === "error" ? (
                <div className="absolute left-4 top-4 z-10 max-w-[calc(100%-2rem)] rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700 shadow-sm ring-1 ring-orange-100">{loadError ?? AMAP_LOAD_ERROR_MESSAGE}</div>
              ) : null}
              {data.heatPoints.map((point) => {
                const left = normalize(point.longitude, bounds.minLng, bounds.maxLng);
                const top = 100 - normalize(point.latitude, bounds.minLat, bounds.maxLat);
                return (
                  <span
                    className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-400/20 blur-sm"
                    key={point.id}
                    style={{ left: `${left}%`, top: `${top}%` }}
                    title={`${point.orderNo} ${formatCurrency(point.amount)}`}
                  />
                );
              })}
              {data.dealers.map((dealer) => {
                const left = normalize(dealer.longitude, bounds.minLng, bounds.maxLng);
                const top = 100 - normalize(dealer.latitude, bounds.minLat, bounds.maxLat);
                return (
                  <div className="absolute -translate-x-1/2 -translate-y-1/2" key={dealer.id} style={{ left: `${left}%`, top: `${top}%` }}>
                    <div
                      className={cn(
                        "absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                        dealer.isAccepting ? "border-orange-300 bg-orange-100/40" : "border-[#d8c2b2] bg-[#efe3d7]/60",
                      )}
                      style={{ width: `${Math.max(70, dealer.serviceRadius / 25)}px`, height: `${Math.max(70, dealer.serviceRadius / 25)}px` }}
                    />
                    <div className={cn("flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium shadow-sm", dealer.isAccepting ? "bg-[#dc2626] text-white" : "bg-[#8a7264] text-white")}>
                      <MapPinned className="h-4 w-4" />
                      {dealer.name}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
