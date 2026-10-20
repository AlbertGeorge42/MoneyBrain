import React from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}

const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, actions }) => {
  return (
    <div className="page-header">
      <div className="page-header__copy">
        {eyebrow ? <span className="page-header__eyebrow">{eyebrow}</span> : null}
        <div>
          <h1 className="page-header__title">{title}</h1>
          {description ? <p className="page-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  )
}

export default PageHeader
