"use client"

import {
  CardFeature,
  type IconName,
  useIcon,
} from "@workspace/ui/components/sidebar"

type Feature = {
  title: string
  description: string
  iconName: IconName
}

export function BrandFeatureItem({ feature }: { feature: Feature }) {
  const Icon = useIcon(feature.iconName)
  return (
    <CardFeature
      icon={Icon}
      title={feature.title}
      description={feature.description}
    />
  )
}
