"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Globe2,
  Layers3,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { hasReceivablesAccess } from "@/lib/receivables";
import { useI18n } from "@/components/i18n-provider";
import { pagePath } from "@/lib/routes";
import type { User } from "@/lib/types";

export function WorkspaceHome({ user }: { user: User }) {
  const { tr, locale } = useI18n();
  return (
    <main className="workspace-home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-eyebrow">
            <span />
            {tr("home.workspace")}
          </p>
          <p className="home-welcome">
            {tr("home.welcome", { name: user.name })}
          </p>
          <h1 id="home-title">
            {tr("home.title")}
            <br />
            <span>{tr("home.headline")}</span>
          </h1>
          <p className="home-intro">{tr("home.intro")}</p>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          <div className="home-orbit home-orbit-outer" />
          <div className="home-orbit home-orbit-inner" />
          <div className="home-art-grid" />
          <div className="home-art-panel">
            <div className="home-art-top">
              <BarChart3 size={22} />
              <span />
              <ArrowUpRight size={22} />
            </div>
            <div className="home-art-bars">
              {[36, 51, 43, 67, 61, 85, 100].map((height, i) => (
                <i key={i} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="home-art-baseline" />
          </div>
          <div className="home-art-badge">
            <TrendingUp size={27} />
          </div>
        </div>
        <div className="home-hero-caption">
          <Globe2 size={14} aria-hidden="true" />
          <span>{tr("home.regionalWorkspace")}</span>
        </div>
      </section>

      <section className="home-modules" aria-labelledby="home-modules-title">
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">{tr("home.explore")}</p>
            <h2 id="home-modules-title">{tr("home.modules")}</h2>
          </div>
          <p>{tr("home.chooseModule")}</p>
        </div>
        <div className="home-module-grid">
          <Link
            className="home-module-card"
            href={pagePath(locale, "overview")}
            aria-labelledby="home-sales-title"
            aria-describedby="home-sales-description"
          >
            <div className="home-card-top">
              <span className="home-module-icon">
                <BarChart3 size={28} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span className="home-module-tag">{tr("home.salesTag")}</span>
              <ArrowUpRight
                className="home-card-arrow"
                size={23}
                aria-hidden="true"
              />
            </div>
            <h3 id="home-sales-title">{tr("nav.performance")}</h3>
            <p id="home-sales-description">{tr("home.salesDescription")}</p>
            <div className="home-module-features">
              <span>
                <TrendingUp size={15} aria-hidden="true" />
                {tr("home.featureSales")}
              </span>
              <span>
                <Layers3 size={15} aria-hidden="true" />
                {tr("home.featureOrders")}
              </span>
              <span>
                <Target size={15} aria-hidden="true" />
                {tr("home.featureBudget")}
              </span>
            </div>
            <div className="home-card-footer">
              <span>{tr("home.openSales")}</span>
              <span className="home-card-action">
                <ArrowRight size={19} aria-hidden="true" />
              </span>
            </div>
          </Link>
          {hasReceivablesAccess(user) && <Link className="home-module-card" href={pagePath(locale, "ar-aging")}
            aria-labelledby="home-ar-title" aria-describedby="home-ar-description">
            <div className="home-card-top"><span className="home-module-icon"><WalletCards size={28} strokeWidth={1.6} aria-hidden="true" /></span>
              <span className="home-module-tag">{tr("ar.homeTag")}</span><ArrowUpRight className="home-card-arrow" size={23} aria-hidden="true" /></div>
            <h3 id="home-ar-title">{tr("ar.title")}</h3><p id="home-ar-description">{tr("ar.homeDescription")}</p>
            <div className="home-module-features"><span>{tr("ar.featureAging")}</span><span>{tr("ar.featureTeams")}</span><span>{tr("ar.featureReceipts")}</span></div>
            <div className="home-card-footer"><span>{tr("ar.homeOpen")}</span><span className="home-card-action"><ArrowRight size={19} aria-hidden="true" /></span></div>
          </Link>}
        </div>
      </section>
      <footer className="home-footer">
        <span>{tr("home.footerBrand")}</span>
        <span>{tr("home.footerNote")}</span>
      </footer>
    </main>
  );
}
